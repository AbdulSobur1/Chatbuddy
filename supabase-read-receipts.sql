-- ============================================================
-- ChatBuddy - Read Receipts Migration
-- Adds last_read_message_id tracking to channel_members
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- 1. Add last_read_message_id to channel_members
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS last_read_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- 2. Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_channel_members_last_read
  ON public.channel_members (channel_id, user_id, last_read_message_id);

-- 3. Function to mark messages as read
-- Sets last_read_message_id to the given message_id for the current user in a channel.
-- Always updates because the client always passes the latest message ID.
CREATE OR REPLACE FUNCTION public.mark_channel_read(channel_id uuid, message_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.channel_members
  SET last_read_message_id = message_id
  WHERE channel_id = $1
    AND user_id = auth.uid();
$$;

-- 4. RLS policy for updating last_read_message_id
DROP POLICY IF EXISTS "Users can update own read status" ON public.channel_members;
CREATE POLICY "Users can update own read status"
  ON public.channel_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
