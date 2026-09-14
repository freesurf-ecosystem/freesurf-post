-- FreeSurf — Consents (shared, ecosystem-wide)
-- =============================================
-- A single agreement record for terms/privacy/AI-processing across ALL FreeSurf apps.
-- Deliberately NOT prefixed with `post_` — this table is shared.
--
-- user_id is a TEXT identity, matching the `usage` table convention:
--   - signed-in account id (uuid rendered as text), or
--   - 'anon:<deviceId>' for anonymous-first users.
-- Anonymous/device rows are written by our Cloudflare workers with the service-role key
-- (which bypasses RLS). Authenticated clients may read/write their own rows via RLS below.

DROP TABLE IF EXISTS consents CASCADE;

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,           -- account uuid (as text) OR 'anon:<deviceId>'
  type TEXT NOT NULL,              -- e.g., 'terms'
  version TEXT,                    -- e.g., '2026-09-09'
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_user_type ON consents(user_id, type);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own consent" ON consents
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can view their own consents" ON consents
  FOR SELECT USING (auth.uid()::text = user_id);
