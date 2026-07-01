-- ============================================================
-- ChatBuddy — Security Hardening
-- ============================================================
-- Run this file AFTER supabase-canonical.sql has been applied.
-- Safe to run multiple times (uses IF EXISTS / DROP POLICY IF EXISTS).
-- ============================================================
-- Last updated: June 26, 2026
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- FIX 1: Revoke anon EXECUTE on all SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════
-- These functions are used internally by RLS policies and triggers
-- only. Anonymous users should never be able to call them directly
-- via /rest/v1/rpc/. We revoke from both anon and authenticated,
-- then grant back only to the roles that actually need them.
-- ═══════════════════════════════════════════════════════════════

-- ── RLS helper functions: grant EXECUTE to authenticated only ──
-- (these are called inside RLS policies which run as the authenticated user)

REVOKE EXECUTE ON FUNCTION public.can_access_channel(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_channel_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_channel_creator(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_creator(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_channel_follower(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_follower(uuid) TO authenticated;

-- get_push_token is called by the notification Edge Function (service_role) or by authenticated users
REVOKE EXECUTE ON FUNCTION public.get_push_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_push_token(uuid) TO authenticated;

-- check_message_rate_limit is called inside RLS policies as authenticated user
REVOKE EXECUTE ON FUNCTION public.check_message_rate_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_message_rate_limit() TO authenticated;

-- mark_channel_read is called by authenticated users via supabase.rpc()
REVOKE EXECUTE ON FUNCTION public.mark_channel_read(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_channel_read(uuid, uuid) TO authenticated;

-- ── Trigger functions: grant EXECUTE to postgres role only ──
-- (these run automatically via triggers, never called by users)

REVOKE EXECUTE ON FUNCTION public.set_invite_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_invite_code() TO postgres;

REVOKE EXECUTE ON FUNCTION public.update_channel_member_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_channel_member_count() TO postgres;

REVOKE EXECUTE ON FUNCTION public.update_channel_follower_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_channel_follower_count() TO postgres;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

-- rls_auto_enable() may exist from earlier migrations; lock it down if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- FIX 2: Lock search_path on all SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════
-- Without a locked search_path, a malicious user who creates a
-- table in a public schema could hijack function execution
-- (search_path injection). We lock each function to search_path = ''
-- so PostgreSQL only looks in pg_catalog and the function's own schema.
-- Note: handle_new_user() already has SET search_path = '' from creation.
-- ═══════════════════════════════════════════════════════════════

ALTER FUNCTION public.is_channel_member(uuid) SET search_path = '';
ALTER FUNCTION public.is_channel_creator(uuid) SET search_path = '';
ALTER FUNCTION public.is_channel_follower(uuid) SET search_path = '';
ALTER FUNCTION public.can_access_channel(uuid) SET search_path = '';
ALTER FUNCTION public.get_push_token(uuid) SET search_path = '';
ALTER FUNCTION public.check_message_rate_limit() SET search_path = '';
ALTER FUNCTION public.mark_channel_read(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.set_invite_code() SET search_path = '';
ALTER FUNCTION public.update_channel_member_count() SET search_path = '';
ALTER FUNCTION public.update_channel_follower_count() SET search_path = '';


-- ═══════════════════════════════════════════════════════════════
-- FIX 3: Restrict chat-media storage bucket access to own folder
-- ═══════════════════════════════════════════════════════════════
-- The existing policies allow any authenticated user to view ANY
-- file in chat-media. We replace them with folder-scoped policies
-- so users can only access files within their own user_id folder.
-- ═══════════════════════════════════════════════════════════════

-- Drop existing broad storage policies
DROP POLICY IF EXISTS "Users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- CREATE (idempotent): scoped SELECT — users can only view files in their own folder
-- The foldername() function extracts directory components. We check both the first
-- and second folder components to support both {userId}/file.ext and
-- avatars/{userId}/file.ext patterns.
DROP POLICY IF EXISTS "Users can view own files" ON storage.objects;
CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- CREATE (idempotent): scoped INSERT — users can only upload to their own folder
-- Checks both first and second folder components to support both
-- {userId}/file.ext and avatars/{userId}/file.ext upload paths.
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- CREATE (idempotent): scoped DELETE — users can only delete their own files
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
  );


-- ═══════════════════════════════════════════════════════════════
-- FIX 4: Enable leaked password protection
-- ═══════════════════════════════════════════════════════════════
-- This cannot be done in SQL. Manual step required:
--
-- MANUAL STEP: Enable leaked password protection in Supabase Dashboard
-- Go to: Authentication → Settings → Password Security
-- Toggle ON: "Check passwords against HaveIBeenPwned.org"
--
-- This will prevent users from signing up with a password that
-- has been exposed in known data breaches.
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- Verification queries (run these separately to confirm):
-- ═══════════════════════════════════════════════════════════════
-- -- Check function permissions:
-- SELECT n.nspname, p.proname, p.proconfig,
--        pg_catalog.pg_get_function_result(p.oid) as result_type,
--        pg_catalog.pg_get_function_arguments(p.oid) as args
-- FROM pg_catalog.pg_proc p
-- LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('is_channel_member', 'is_channel_creator',
--     'is_channel_follower', 'can_access_channel', 'set_invite_code',
--     'update_channel_member_count', 'update_channel_follower_count',
--     'handle_new_user', 'get_push_token', 'check_message_rate_limit',
--     'mark_channel_read')
--   AND p.proconfig @> ARRAY['search_path='];
--
-- -- Check storage policies:
-- SELECT policyname, cmd, permissive, roles, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'objects' AND schemaname = 'storage';
-- ═══════════════════════════════════════════════════════════════
