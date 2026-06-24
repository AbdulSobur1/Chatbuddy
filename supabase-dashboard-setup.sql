-- ============================================================
-- ChatBuddy - Supabase Dashboard Setup Script
-- Run this entire script in Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. ENABLE REALTIME on messages, message_reactions, users
-- ============================================================
-- This allows the app to subscribe to live updates
-- Without this, real-time messaging won't work

-- Create publication if it doesn't exist (PostgreSQL 14 compatible)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables to the publication, skipping any that are already members
-- This avoids the "already member of publication" error
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['messages', 'message_reactions', 'users', 'status_updates', 'calls']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
        AND c.relname = tbl
        AND c.relnamespace = 'public'::regnamespace
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- Enable replication identity for change tracking
-- 'FULL' means the entire row is sent as the old row for UPDATE/DELETE
-- This is required by Supabase Realtime to deliver full record payloads
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;

-- ============================================================
-- 2. CREATE chat-media STORAGE BUCKET
-- ============================================================
-- This is used for uploading photos, voice notes, files, and status images
-- Creates bucket if it doesn't exist, sets it to public, adds RLS policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  52428800, -- 50 MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'video/mp4',
    'application/pdf',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'video/mp4', 'application/pdf', 'text/plain'
  ];

-- Storage RLS: Anyone authenticated can upload
DROP POLICY IF EXISTS "Users can upload files" ON storage.objects;
CREATE POLICY "Users can upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

-- Storage RLS: Anyone can view files
DROP POLICY IF EXISTS "Anyone can view files" ON storage.objects;
CREATE POLICY "Anyone can view files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-media');

-- Storage RLS: Users can delete their own files
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
  );

-- ============================================================
-- 3. EDGE FUNCTION — DEPLOY VIA CLI
-- ============================================================
-- Run in your terminal:
--   supabase functions deploy send-notification --project-ref pfidvejfnssiioxtvqed
--
-- Make sure you have the SUPABASE_SERVICE_ROLE_KEY set:
--   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
--
-- Get the service role key from: Supabase Dashboard > Settings > API

-- ============================================================
-- 4. DATABASE WEBHOOK — SET UP VIA DASHBOARD
-- ============================================================
-- After deploying the edge function, set up the webhook:
--
-- Supabase Dashboard > Database > Webhooks > Create Webhook
--   Name: send-notification-on-message
--   Table: messages
--   Event: Insert
--   Type: HTTP Request
--   URL: https://pfidvejfnssiioxtvqed.supabase.co/functions/v1/send-notification
--   HTTP Method: POST
--   Headers:
--     Authorization: Bearer <your-service-role-key>
--     Content-Type: application/json
--
-- Or using the CLI:
--   supabase secrets set SUPABASE_URL=https://pfidvejfnssiioxtvqed.supabase.co
--   supabase functions deploy send-notification
