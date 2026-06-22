-- ============================================================
-- ChatBuddy - RLS Fix: Ensure INSERT policy exists on channels
-- Run this in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- 1. Ensure the INSERT policy exists for channels
-- This is the critical missing policy that causes "new rows violates RLS" errors
drop policy if exists "Users can create channels" on public.channels;
create policy "Users can create channels"
  on public.channels for insert
  to authenticated
  with check (created_by = auth.uid());

-- 2. Ensure the channel_members INSERT policy allows creators to add others
drop policy if exists "Members can add members" on public.channel_members;
create policy "Members can add members"
  on public.channel_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
    )
  );

-- 3. Verify channel_type column has a default (for existing rows)
-- This ensures any insert without channel_type gets 'dm' as default
DO $$
BEGIN
  -- Check if column has a default
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channels'
      AND column_name = 'channel_type'
      AND column_default IS NULL
  ) THEN
    ALTER TABLE public.channels ALTER COLUMN channel_type SET DEFAULT 'dm';
  END IF;
END $$;
