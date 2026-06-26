-- ============================================================
-- ChatBuddy - Mute Notifications Migration
-- Adds muted_until timestamp to channel_members for per-chat mute
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- 1. Add muted_until column to channel_members
-- NULL = not muted, future timestamp = muted until that time
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS muted_until timestamp with time zone;

-- 2. Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_channel_members_muted
  ON public.channel_members (channel_id, user_id, muted_until);
