-- FreeSurf Post — Credits / X-fee ledger (additive migration; safe to re-run)
-- =====================================================================
-- Consolidates columns that were previously tacked onto api_keys.sql so that
-- api_keys.sql stays keys-only. Run this file in the Supabase SQL editor once;
-- it is fully idempotent (IF NOT EXISTS).

-- Columns on post_posts used by posting/scheduling (moved here for consolidation)
ALTER TABLE post_posts ADD COLUMN IF NOT EXISTS has_link boolean NOT NULL DEFAULT false;
ALTER TABLE post_posts ADD COLUMN IF NOT EXISTS bundle_team_id text;

-- ---------------------------------------------------------------------
-- POST_LEDGER — single table for credits AND debits (balance = SUM).
--   amount_micros: integer microdollars (1/1,000,000 USD) so $0.015 X fees
--                  are exact. Positive = credit (top-up), negative = debit (fee).
--   kind: topup | x_fee | adjustment
--   has_link: set on x_fee rows so we can verify URL vs plain text pricing.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_micros BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'adjustment',
  reference_id TEXT,
  has_link BOOLEAN,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_ledger_user ON post_ledger(user_id, created_at DESC);

ALTER TABLE post_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ledger" ON post_ledger;
CREATE POLICY "Users manage own ledger" ON post_ledger
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
