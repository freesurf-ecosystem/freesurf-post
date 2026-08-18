-- cnxt-to-post Database Schema
-- This schema integrates with the shared cnxt auth system
-- All tables are prefixed with 'post_' to avoid conflicts with other cnxt tools

-- ============================================================================
-- PLATFORM TOKENS STORAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_platform_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('bluesky', 'x', 'linkedin', 'facebook', 'instagram', 'threads', 'tiktok')),
  profile_label TEXT NOT NULL DEFAULT 'Default Account',
  
  -- Encrypted access token (always encrypted before storage)
  access_token_encrypted TEXT NOT NULL,
  -- Refresh token (for platforms that support it, also encrypted)
  refresh_token_encrypted TEXT,
  
  -- Platform-specific identifiers
  platform_user_id TEXT,
  platform_handle TEXT,
  
  -- Additional platform-specific data (page IDs, metadata, etc.)
  metadata JSONB DEFAULT '{}',
  
  -- Token lifecycle management
  token_expires_at TIMESTAMP WITH TIME ZONE,
  last_refreshed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient token lookups
CREATE INDEX idx_post_tokens_user_platform ON post_platform_tokens(user_id, platform, is_active);
CREATE INDEX idx_post_tokens_expires_at ON post_platform_tokens(token_expires_at) WHERE token_expires_at IS NOT NULL;
-- One active token per user+platform
CREATE UNIQUE INDEX idx_post_tokens_active_unique ON post_platform_tokens(user_id, platform) WHERE is_active = TRUE;

-- ============================================================================
-- SCHEDULED POSTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_scheduled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Post content
  text TEXT NOT NULL CHECK (LENGTH(text) > 0 AND LENGTH(text) <= 5000),
  media_urls TEXT[] DEFAULT '{}',
  
  -- Target platforms
  platforms TEXT[] NOT NULL CHECK (array_length(platforms, 1) > 0),
  
  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL CHECK (scheduled_for > NOW()),
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Results storage (after posting)
  results JSONB DEFAULT '{}',
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scheduled posts
CREATE INDEX idx_post_scheduled_user_status ON post_scheduled(user_id, status, scheduled_for);
CREATE INDEX idx_post_scheduled_due ON post_scheduled(scheduled_for, status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_post_scheduled_retry ON post_scheduled(user_id, retry_count, max_retries) WHERE status = 'failed' AND retry_count < max_retries;
-- Prevent duplicate pending posts per user (same text)
CREATE UNIQUE INDEX idx_post_scheduled_unique_pending ON post_scheduled(user_id, text) WHERE status = 'pending';

-- ============================================================================
-- POST HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Cross-post grouping ID (all platforms for the same post share this)
  cnxt_post_id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Platform-specific details
  platform TEXT NOT NULL CHECK (platform IN ('bluesky', 'x', 'linkedin', 'facebook', 'instagram', 'threads', 'tiktok', 'youtube', 'pinterest', 'reddit', 'mastodon', 'discord', 'slack', 'google_business', 'snapchat')),
  platform_post_id TEXT,
  platform_post_url TEXT,
  
  -- Post content (for historical record)
  text TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  
  -- Platform-specific token used (for debugging/auditing)
  platform_token_id UUID REFERENCES post_platform_tokens(id) ON DELETE SET NULL,
  
  -- Result tracking
  success BOOLEAN NOT NULL,
  error_message TEXT,
  error_code TEXT,
  
  -- Engagement metrics (cached from platform APIs)
  metrics JSONB DEFAULT '{}',
  metrics_last_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit fields
  posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for post history
CREATE INDEX idx_post_history_user_cnxt ON post_history(user_id, cnxt_post_id);
CREATE INDEX idx_post_history_platform_post ON post_history(platform, platform_post_id) WHERE platform_post_id IS NOT NULL;
CREATE INDEX idx_post_history_posted_at ON post_history(user_id, posted_at DESC);
CREATE INDEX idx_post_history_metrics_update ON post_history(metrics_last_updated_at) WHERE metrics_last_updated_at IS NOT NULL;

-- ============================================================================
-- DRAFTS / CONTENT LIBRARY
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content
  text TEXT NOT NULL CHECK (LENGTH(text) > 0 AND LENGTH(text) <= 5000),
  media_urls TEXT[] DEFAULT '{}',
  
  -- Organization
  title TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Platform-specific customizations
  platform_variants JSONB DEFAULT '{}', -- { "linkedin": { "text": "LinkedIn version" }, "x": { "text": "X version" } }
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for drafts
CREATE INDEX idx_post_drafts_user ON post_drafts(user_id, updated_at DESC);
CREATE INDEX idx_post_drafts_tags ON post_drafts(user_id, tags) USING GIN;

-- ============================================================================
-- POST QUEUE (for auto-posting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Reference to draft or scheduled post
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('draft', 'scheduled', 'recurring')),
  
  -- Post content (copied from source)
  text TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  platforms TEXT[] NOT NULL,
  
  -- Queue schedule
  queue_schedule JSONB NOT NULL, -- { "type": "interval|times", "interval_hours": 24, "times": ["09:00", "15:00"], "timezone": "America/New_York" }
  next_post_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Queue status
  is_active BOOLEAN DEFAULT TRUE,
  post_count_remaining INTEGER DEFAULT -1, -- -1 means unlimited
  total_posts INTEGER DEFAULT 0,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_posted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for queue
CREATE INDEX idx_post_queue_next_post ON post_queue(next_post_at, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_post_queue_user ON post_queue(user_id, is_active);

-- ============================================================================
-- HASHTAG GROUPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_hashtag_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Group details
  name TEXT NOT NULL,
  description TEXT,
  
  -- Hashtags (stored as array for easy querying)
  hashtags TEXT[] NOT NULL CHECK (array_length(hashtags, 1) > 0),
  
  -- Platform association (can be shared or platform-specific)
  platforms TEXT[] CHECK (array_length(platforms, 1) > 0),
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for hashtag groups
CREATE INDEX idx_post_hashtag_groups_user ON post_hashtag_groups(user_id, updated_at DESC);
CREATE INDEX idx_post_hashtag_groups_platforms ON post_hashtag_groups(user_id, platforms) USING GIN;

-- ============================================================================
-- SAVED REPLIES (for community inbox)
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_saved_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Reply content
  title TEXT NOT NULL,
  text TEXT NOT NULL CHECK (LENGTH(text) > 0),
  
  -- Categorization
  tags TEXT[] DEFAULT '{}',
  platforms TEXT[] DEFAULT '{}',
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for saved replies
CREATE INDEX idx_post_saved_replies_user ON post_saved_replies(user_id, updated_at DESC);

-- ============================================================================
-- ENGAGEMENT TRACKING (for analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_engagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnxt_post_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_post_id TEXT NOT NULL,
  
  -- Engagement metrics
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  
  -- Additional platform-specific metrics
  additional_metrics JSONB DEFAULT '{}',
  
  -- Tracking
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for engagement logs
CREATE INDEX idx_post_engagement_user_post ON post_engagement_log(user_id, cnxt_post_id, platform, logged_at DESC);
CREATE INDEX idx_post_engagement_platform_post ON post_engagement_log(platform, platform_post_id, logged_at DESC);
CREATE INDEX idx_post_engagement_logged_at ON post_engagement_log(logged_at DESC);
-- Prevent exact duplicate engagement logs
CREATE UNIQUE INDEX idx_post_engagement_unique ON post_engagement_log(platform, platform_post_id, logged_at);

-- ============================================================================
-- API CREDIT BALANCE (for X API credit system)
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_credit_balance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Credit tracking
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_credits_purchased_cents INTEGER DEFAULT 0,
  total_credits_used_cents INTEGER DEFAULT 0,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- CREDIT TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Transaction details
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'bonus')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  
  -- Reference information
  reference_id TEXT, -- Stripe payment ID, post ID, etc.
  reference_type TEXT,
  description TEXT,
  
  -- Balance snapshot
  balance_after_cents INTEGER NOT NULL,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for credit transactions
CREATE INDEX idx_post_credit_transactions_user ON post_credit_transactions(user_id, created_at DESC);
CREATE INDEX idx_post_credit_transactions_type ON post_credit_transactions(user_id, type, created_at DESC);

-- ============================================================================
-- ERROR LOGGING
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- Nullable for system-level errors
  
  -- Error details
  error_type TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  
  -- Context
  endpoint TEXT,
  method TEXT,
  request_body JSONB,
  platform TEXT,
  
  -- Additional context
  correlation_id TEXT,
  user_agent TEXT,
  ip_address TEXT,
  
  -- Severity tracking
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  
  -- Resolution tracking
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for error logs
CREATE INDEX idx_post_error_log_user ON post_error_log(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_post_error_log_type ON post_error_log(error_type, created_at DESC);
CREATE INDEX idx_post_error_log_severity ON post_error_log(severity, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_post_error_log_correlation ON post_error_log(correlation_id) WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION post_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_post_platform_tokens_updated_at BEFORE UPDATE ON post_platform_tokens
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

CREATE TRIGGER update_post_scheduled_updated_at BEFORE UPDATE ON post_scheduled
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

CREATE TRIGGER update_post_drafts_updated_at BEFORE UPDATE ON post_drafts
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

CREATE TRIGGER update_post_queue_updated_at BEFORE UPDATE ON post_queue
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

CREATE TRIGGER update_post_hashtag_groups_updated_at BEFORE UPDATE ON post_hashtag_groups
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

CREATE TRIGGER update_post_saved_replies_updated_at BEFORE UPDATE ON post_saved_replies
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

CREATE TRIGGER update_post_credit_balance_updated_at BEFORE UPDATE ON post_credit_balance
  FOR EACH ROW EXECUTE FUNCTION post_update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all user-specific tables
ALTER TABLE post_platform_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_scheduled ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtag_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_saved_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_engagement_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_error_log ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own platform tokens" ON post_platform_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platform tokens" ON post_platform_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own platform tokens" ON post_platform_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own platform tokens" ON post_platform_tokens
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own scheduled posts" ON post_scheduled
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled posts" ON post_scheduled
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled posts" ON post_scheduled
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled posts" ON post_scheduled
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own post history" ON post_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own post history" ON post_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own drafts" ON post_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts" ON post_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts" ON post_drafts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts" ON post_drafts
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own queue items" ON post_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue items" ON post_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue items" ON post_queue
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue items" ON post_queue
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own hashtag groups" ON post_hashtag_groups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own hashtag groups" ON post_hashtag_groups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own hashtag groups" ON post_hashtag_groups
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own hashtag groups" ON post_hashtag_groups
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own saved replies" ON post_saved_replies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved replies" ON post_saved_replies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved replies" ON post_saved_replies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved replies" ON post_saved_replies
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own engagement logs" ON post_engagement_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own engagement logs" ON post_engagement_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own credit balance" ON post_credit_balance
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credit balance" ON post_credit_balance
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credit balance" ON post_credit_balance
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own credit transactions" ON post_credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credit transactions" ON post_credit_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own error logs" ON post_error_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can bypass RLS for background processing
-- (This is handled by Supabase's service role key automatically)

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for active user profiles
CREATE OR REPLACE VIEW post_active_user_profiles AS
SELECT 
  user_id,
  platform,
  platform_handle,
  profile_label,
  token_expires_at,
  is_active
FROM post_platform_tokens
WHERE is_active = TRUE;

-- View for recent post activity
CREATE OR REPLACE VIEW post_recent_activity AS
SELECT 
  ph.user_id,
  ph.cnxt_post_id,
  ph.platform,
  ph.platform_post_id,
  ph.success,
  ph.error_message,
  ph.posted_at,
  ph.metrics
FROM post_history ph
WHERE ph.posted_at > NOW() - INTERVAL '30 days'
ORDER BY ph.posted_at DESC;

-- View for engagement summary
CREATE OR REPLACE VIEW post_engagement_summary AS
SELECT 
  ph.user_id,
  ph.cnxt_post_id,
  ph.platform,
  ph.posted_at,
  COALESCE(ph.metrics->>'likes', '0')::INTEGER as likes,
  COALESCE(ph.metrics->>'comments', '0')::INTEGER as comments,
  COALESCE(ph.metrics->>'shares', '0')::INTEGER as shares,
  COALESCE(ph.metrics->>'impressions', '0')::INTEGER as impressions
FROM post_history ph
WHERE ph.success = TRUE AND ph.metrics != '{}'
ORDER BY ph.posted_at DESC;

-- ============================================================================
-- INITIALIZATION
-- ============================================================================

-- Create function to initialize user accounts
CREATE OR REPLACE FUNCTION initialize_post_user_account(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- Initialize credit balance for new users
  INSERT INTO post_credit_balance (user_id, balance_cents)
  VALUES (user_uuid, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;