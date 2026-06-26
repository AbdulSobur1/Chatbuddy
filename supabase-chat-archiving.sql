-- ============================================================
-- ChatBuddy - Chat Archiving Migration
-- Adds archived_at timestamp to channel_members
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- 1. Add archived_at column to channel_members
-- NULL = not archived, timestamp = archived at that time
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

-- 2. Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_channel_members_archived
  ON public.channel_members (channel_id, user_id, archived_at);
