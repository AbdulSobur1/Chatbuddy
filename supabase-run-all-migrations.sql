-- ============================================================
-- ChatBuddy — Combined Migration: Run ALL in one go
-- Paste this entire file into the Supabase Dashboard SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================
-- Last updated: June 26, 2026
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- #8  — Chat Archiving
-- Adds archived_at to channel_members so users can
-- archive/unarchive DMs from the long-press action sheet.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_channel_members_archived
  ON public.channel_members (channel_id, user_id, archived_at);


-- ═══════════════════════════════════════════════════════════════
-- #12 — Pin Chats
-- Adds pinned_at to channel_members so users can pin
-- important conversations to the top of their DM list.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_channel_members_pinned
  ON public.channel_members (user_id, pinned_at)
  WHERE pinned_at IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- #18 — Scheduled Messages
-- Adds scheduled_at to messages so users can write messages
-- that are delivered at a future time. The client polls every
-- 30s for due messages and clears scheduled_at to deliver them.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_scheduled_at
  ON public.messages (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- RLS: Allow users to update (unset) scheduled_at on their own messages
-- (so the client can "send" a scheduled message by clearing the timestamp)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can update scheduled_at on own messages'
  ) THEN
    CREATE POLICY "Users can update scheduled_at on own messages"
      ON public.messages
      FOR UPDATE
      USING (sender_id = auth.uid())
      WITH CHECK (sender_id = auth.uid());
  END IF;
END
$$;


-- ═══════════════════════════════════════════════════════════════
-- Verification queries (run these separately to confirm):
-- ═══════════════════════════════════════════════════════════════
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'channel_members' AND column_name IN ('archived_at', 'pinned_at');
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'messages' AND column_name = 'scheduled_at';
-- ═══════════════════════════════════════════════════════════════
