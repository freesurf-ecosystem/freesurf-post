-- FreeSurf — Consents (shared, ecosystem-wide)
-- =============================================
-- A single agreement record for terms/privacy across ALL FreeSurf apps.
-- Deliberately NOT prefixed with `post_` — this table is shared.

DROP TABLE IF EXISTS consents CASCADE;

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,              -- e.g., 'terms'
  version TEXT,                    -- e.g., '2026-08-01'
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consents_user_type ON consents(user_id, type);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own consent" ON consents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own consents" ON consents
  FOR SELECT USING (auth.uid() = user_id);
