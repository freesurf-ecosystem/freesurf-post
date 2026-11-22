-- Rate-limit counters (migrated off Workers KV).
-- Applied via: npx wrangler d1 execute freesurf-post-rate-limits --file=./migrations/0001_post_counters.sql

CREATE TABLE IF NOT EXISTS post_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_counters_expires_at ON post_counters (expires_at);
