-- FreeSurf Post — Database Schema (consolidated)
-- =====================================================
-- Three `post_`-prefixed tables, shared with the rest of the FreeSurf ecosystem:
--   post_accounts — a user's connected social accounts + API tokens
--   post_posts    — everything a user composes: drafts, scheduled, queued, posted
--   post_content  — misc per-user content (hashtag groups, saved replies)
--
-- All three are keyed by auth.users(id) with RLS. The Worker uses the service
-- role key (bypasses RLS); the dashboard/mobile only talk to the Worker API.

-- ============================================================================
-- CLEANUP — drop legacy tables/views/functions so this file can be re-run
-- ============================================================================
DROP VIEW IF EXISTS post_active_user_profiles CASCADE;
DROP VIEW IF EXISTS post_recent_activity CASCADE;
DROP VIEW IF EXISTS post_engagement_summary CASCADE;

-- legacy multi-table schema
DROP TABLE IF EXISTS post_error_log CASCADE;
DROP TABLE IF EXISTS post_credit_transactions CASCADE;
DROP TABLE IF EXISTS post_credit_balance CASCADE;
DROP TABLE IF EXISTS post_engagement_log CASCADE;
DROP TABLE IF EXISTS post_saved_replies CASCADE;
DROP TABLE IF EXISTS post_hashtag_groups CASCADE;
DROP TABLE IF EXISTS post_queue CASCADE;
DROP TABLE IF EXISTS post_drafts CASCADE;
DROP TABLE IF EXISTS post_history CASCADE;
DROP TABLE IF EXISTS post_scheduled CASCADE;
DROP TABLE IF EXISTS post_platform_tokens CASCADE;
DROP TABLE IF EXISTS scheduled_posts CASCADE;
DROP TABLE IF EXISTS platform_tokens CASCADE;

-- un-prefixed tables from an earlier consolidation pass
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS content CASCADE;

-- current tables (for clean re-runs)
DROP TABLE IF EXISTS post_accounts CASCADE;
DROP TABLE IF EXISTS post_posts CASCADE;
DROP TABLE IF EXISTS post_content CASCADE;

DROP FUNCTION IF EXISTS post_update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS initialize_post_user_account(uuid) CASCADE;
DROP FUNCTION IF EXISTS fs_update_updated_at() CASCADE;

-- ============================================================================
-- POST_ACCOUNTS — connected social accounts + API tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  profile_label TEXT NOT NULL DEFAULT 'Default',
  platform_handle TEXT,
  platform_user_id TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_accounts_user ON post_accounts(user_id, platform);

-- ============================================================================
-- POST_POSTS — unified: drafts, scheduled, queued, posted, failed
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- status: draft | scheduled | queued | posted | failed
  status TEXT NOT NULL DEFAULT 'draft',

  text TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  platforms TEXT[] DEFAULT '{}',

  scheduled_at TIMESTAMP WITH TIME ZONE,
  posted_at TIMESTAMP WITH TIME ZONE,

  -- per-platform results after publishing: [{ platform, success, postId, postUrl, error }]
  results JSONB DEFAULT '[]',
  -- cached engagement metrics: { bluesky: { likes, comments, shares }, ... }
  metrics JSONB DEFAULT '{}',
  error TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_posts_user_status ON post_posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_post_posts_user_scheduled ON post_posts(user_id, scheduled_at) WHERE scheduled_at IS NOT NULL;

-- ============================================================================
-- POST_CONTENT — misc per-user content (hashtag groups, saved replies)
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- type: hashtag_group | saved_reply
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_content_user_type ON post_content(user_id, type);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION fs_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_accounts_updated BEFORE UPDATE ON post_accounts
  FOR EACH ROW EXECUTE FUNCTION fs_update_updated_at();
CREATE TRIGGER trg_post_posts_updated BEFORE UPDATE ON post_posts
  FOR EACH ROW EXECUTE FUNCTION fs_update_updated_at();
CREATE TRIGGER trg_post_content_updated BEFORE UPDATE ON post_content
  FOR EACH ROW EXECUTE FUNCTION fs_update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE post_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own post accounts" ON post_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own post posts" ON post_posts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own post content" ON post_content
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
