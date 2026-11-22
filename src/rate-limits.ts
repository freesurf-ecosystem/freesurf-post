/**
 * Rate-limit counters backed by D1 (primary) with a KV fallback for a safe
 * rollout before the D1 database is provisioned.
 *
 * Why D1 over KV: KV's free tier is generous on reads but tight on writes
 * (1k/day) and has no atomic increment, so every counter costs a read + a write.
 * D1 is on the free plan too, offers ~100k writes/day, and can increment a
 * counter atomically in a single statement (no read-before-write race).
 */

export interface CounterStore {
  db?: D1Database;
  kv?: KVNamespace;
}

/** True when either store is configured (otherwise rate limiting is disabled). */
export function counterStoreAvailable(store: CounterStore): boolean {
  return Boolean(store.db) || Boolean(store.kv);
}

/**
 * Read a counter (0 when absent). Keys are window-scoped (minute/day/month
 * stamps are baked into the key), so an expired row is never re-read for a
 * later window.
 */
export async function getCounter(store: CounterStore, key: string): Promise<number> {
  if (store.db) {
    const row = await store.db
      .prepare("SELECT count FROM post_counters WHERE key = ?1")
      .bind(key)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }
  return parseInt((await store.kv?.get(key)) ?? "0");
}

/**
 * Atomically increment a counter and return the new value. The D1 path is a
 * single upsert (INSERT ... ON CONFLICT DO UPDATE) with RETURNING, so there is
 * no read-before-write race.
 */
export async function incrementCounter(
  store: CounterStore,
  key: string,
  ttlSeconds: number
): Promise<number> {
  if (store.db) {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const row = await store.db
      .prepare(
        `INSERT INTO post_counters (key, count, expires_at)
         VALUES (?1, 1, ?2)
         ON CONFLICT(key) DO UPDATE SET count = count + 1
         RETURNING count`
      )
      .bind(key, expiresAt)
      .first<{ count: number }>();
    return row?.count ?? 1;
  }
  const current = parseInt((await store.kv?.get(key)) ?? "0");
  const next = current + 1;
  await store.kv?.put(key, String(next), { expirationTtl: ttlSeconds });
  return next;
}

/** Remove expired counter rows so the table stays small. Run from the cron. */
export async function cleanupExpiredCounters(db: D1Database): Promise<void> {
  await db
    .prepare("DELETE FROM post_counters WHERE expires_at < ?1")
    .bind(Math.floor(Date.now() / 1000))
    .run();
}
