-- FreeSurf Post — API keys (additive migration; safe to re-run)
-- =============================================================
-- Run this file separately in the Supabase SQL editor. It does NOT drop or
-- recreate anything, so it will not disturb existing data.

CREATE TABLE IF NOT EXISTS post_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default key',
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_post_api_keys_user ON post_api_keys(user_id);

ALTER TABLE post_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own api keys" ON post_api_keys;
CREATE POLICY "Users manage own api keys" ON post_api_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

