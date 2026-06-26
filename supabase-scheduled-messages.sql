-- ─── Scheduled Messages Migration ─────────────────────────────
-- Adds scheduled_at column to messages for future message scheduling
-- Run this SQL in your Supabase Dashboard SQL Editor

-- Add scheduled_at column to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient polling of due scheduled messages
CREATE INDEX IF NOT EXISTS idx_messages_scheduled_at
ON messages (scheduled_at)
WHERE scheduled_at IS NOT NULL;

-- Allow users to update (only unset scheduled_at for their own messages)
CREATE POLICY "Users can update scheduled_at on own messages"
ON messages
FOR UPDATE
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());
