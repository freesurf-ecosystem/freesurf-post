-- FreeSurf Post — post_posts migration for scheduling (safe to re-run)
-- =====================================================================
-- Adds the columns the post/schedule endpoints expect on `post_posts`
-- plus the credits ledger table. Fully idempotent (IF NOT EXISTS).
-- Run in the Supabase SQL editor: Dashboard → SQL Editor → New query.

ALTER TABLE post_posts ADD COLUMN IF NOT EXISTS has_link boolean NOT NULL DEFAULT false;
ALTER TABLE post_posts ADD COLUMN IF NOT EXISTS bundle_team_id text;
ALTER TABLE post_posts ADD COLUMN IF NOT EXISTS platform_targets JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS post_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_micros BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'adjustment',
  reference_id TEXT,
  has_link BOOLEAN,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_credits_user ON post_credits(user_id, created_at DESC);

ALTER TABLE post_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own credits" ON post_credits;
CREATE POLICY "Users manage own credits" ON post_credits
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
