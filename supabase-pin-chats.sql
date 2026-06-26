-- ============================================================
-- ChatBuddy - Pin Chats Migration
-- Adds pinned_at timestamp to channel_members
-- ============================================================

-- 1. Add pinned_at column to channel_members
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone;

-- 2. Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_channel_members_pinned
  ON public.channel_members (user_id, pinned_at)
  WHERE pinned_at IS NOT NULL;
