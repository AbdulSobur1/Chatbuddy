-- ============================================================
-- ChatBuddy — Canonical Schema & RLS Policies
-- ============================================================
-- This file is the SINGLE SOURCE OF TRUTH for all database
-- policies, tables, functions, and constraints.
-- Safe to run multiple times (uses DROP IF EXISTS / IF NOT EXISTS).
-- ============================================================
-- Last updated: June 26, 2026
-- ============================================================

-- ============================================================
-- 0. EXTENSION: pgcrypto for gen_random_uuid()
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. SECURITY DEFINER FUNCTIONS
-- ============================================================

-- Check if the authenticated user is a member of a channel (dm/group)
create or replace function public.is_channel_member(channel_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.channel_members
    where channel_members.channel_id = $1
      and channel_members.user_id = auth.uid()
  );
$$;

-- Check if the authenticated user is a follower of a broadcast channel
create or replace function public.is_channel_follower(channel_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.channel_followers
    where channel_followers.channel_id = $1
      and channel_followers.user_id = auth.uid()
  );
$$;

-- Check if the authenticated user created the channel
create or replace function public.is_channel_creator(channel_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.channels
    where channels.id = $1
      and channels.created_by = auth.uid()
  );
$$;

-- Comprehensive access check: member (dm/group), follower (broadcast), or creator
create or replace function public.can_access_channel(channel_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.channels c
    where c.id = $1
      and (
        c.created_by = auth.uid()
        or (c.channel_type = 'broadcast' and exists (
          select 1 from public.channel_followers
          where channel_followers.channel_id = c.id
            and channel_followers.user_id = auth.uid()
        ))
        or (c.channel_type in ('dm', 'group') and exists (
          select 1 from public.channel_members
          where channel_members.channel_id = c.id
            and channel_members.user_id = auth.uid()
        ))
      )
  );
$$;

-- Securely fetch push_token — only callable by the authenticated user or
-- the notification Edge Function (via service_role key, not via RLS)
create or replace function public.get_push_token(user_id uuid)
returns text
language sql
security definer
as $$
  select push_token from public.users where id = $1;
$$;

-- Rate limiting: returns false if user has sent >30 messages in last 60 seconds
create or replace function public.check_message_rate_limit()
returns boolean
language sql
security definer
as $$
  select (
    select count(*) from public.messages
    where sender_id = auth.uid()
      and created_at > now() - interval '60 seconds'
  ) <= 30;
$$;

-- ============================================================
-- 2. USERS TABLE
-- ============================================================

-- Uses the existing table; no schema changes unless needed
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'User';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone;

-- ============================================================
-- 3. CHANNELS TABLE
-- ============================================================

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_group boolean DEFAULT true;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS channel_type text NOT NULL DEFAULT 'dm';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS member_count integer DEFAULT 0;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS follower_count integer DEFAULT 0;

-- ============================================================
-- 4. CHANNEL MEMBERS TABLE — schema updates
-- ============================================================

ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS last_read_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS muted_until timestamp with time zone;
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone;

-- ============================================================
-- 5. MESSAGES TABLE — constraint updates
-- ============================================================

-- Limit message content to 10,000 characters
-- Uses DO block for PostgreSQL <15 compatibility (ADD CONSTRAINT IF NOT EXISTS is PG15+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_content_length_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_content_length_check
      CHECK (char_length(content) <= 10000);
  END IF;
END
$$;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id);

-- ============================================================
-- 6. AI CONVERSATIONS TABLE (for Task 2 — AI Chat Assistant)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid DEFAULT gen_random_uuid() primary key,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user
  ON public.ai_conversations (user_id, created_at DESC);

-- ============================================================
-- 7. VOICE NOTE TRANSCRIPTS TABLE (for Task 4 — Transcription)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voice_note_transcripts (
  id uuid DEFAULT gen_random_uuid() primary key,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL UNIQUE,
  transcript text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.voice_note_transcripts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_message
  ON public.voice_note_transcripts (message_id);

-- ============================================================
-- 5a. ENSURE ALL REFERENCED TABLES EXIST
-- ============================================================
-- These tables may have been created by separate migration files.
-- We add CREATE TABLE IF NOT EXISTS here so DROP POLICY below doesn't
-- fail with "relation does not exist" on a fresh project.
-- ============================================================

-- Blocked users (from supabase-block-users.sql)
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  blocked_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Channel followers (from supabase-migration-v2.sql)
CREATE TABLE IF NOT EXISTS public.channel_followers (
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  followed_at timestamp with time zone DEFAULT now(),
  primary key (channel_id, user_id)
);
ALTER TABLE public.channel_followers ENABLE ROW LEVEL SECURITY;

-- Status updates / stories (from supabase-migration-v2.sql)
CREATE TABLE IF NOT EXISTS public.status_updates (
  id uuid DEFAULT gen_random_uuid() primary key,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content text,
  media_url text,
  media_type text DEFAULT 'text',
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '24 hours')
);
ALTER TABLE public.status_updates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.status_views (
  status_id uuid REFERENCES public.status_updates(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone DEFAULT now(),
  primary key (status_id, viewer_id)
);
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

-- Calls (from supabase-migration-v2.sql)
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid DEFAULT gen_random_uuid() primary key,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  caller_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  call_type text NOT NULL DEFAULT 'audio',
  status text NOT NULL DEFAULT 'missed',
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  duration integer DEFAULT 0
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
-- ============================================================
-- 5b. DROP ALL EXISTING POLICIES
-- ============================================================

-- Users
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Channels
DROP POLICY IF EXISTS "Users can view channels" ON public.channels;
DROP POLICY IF EXISTS "Users can create channels" ON public.channels;
DROP POLICY IF EXISTS "Users can update channels" ON public.channels;
DROP POLICY IF EXISTS "Users can delete channels" ON public.channels;
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
DROP POLICY IF EXISTS "Members can create channels" ON public.channels;
DROP POLICY IF EXISTS "Anyone can view broadcast channels" ON public.channels;
DROP POLICY IF EXISTS "Creator can update channels" ON public.channels;

-- Channel Members
DROP POLICY IF EXISTS "Users can view channel_members" ON public.channel_members;
DROP POLICY IF EXISTS "Users can add members" ON public.channel_members;
DROP POLICY IF EXISTS "Users can remove members" ON public.channel_members;
DROP POLICY IF EXISTS "Members can view channel_members" ON public.channel_members;
DROP POLICY IF EXISTS "Members can add themselves" ON public.channel_members;
DROP POLICY IF EXISTS "Members can add members" ON public.channel_members;
DROP POLICY IF EXISTS "Members can remove members" ON public.channel_members;
DROP POLICY IF EXISTS "Users can update own read status" ON public.channel_members;

-- Messages
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages" ON public.messages;
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Members can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update scheduled_at on own messages" ON public.messages;

-- Message Reactions
DROP POLICY IF EXISTS "Users can view reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Members can view reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert own reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.message_reactions;

-- Channel Followers
DROP POLICY IF EXISTS "Users can follow channels" ON public.channel_followers;
DROP POLICY IF EXISTS "Users can follow/unfollow channels" ON public.channel_followers;
DROP POLICY IF EXISTS "Users can view followers" ON public.channel_followers;
DROP POLICY IF EXISTS "Users can unfollow" ON public.channel_followers;

-- Blocked Users
DROP POLICY IF EXISTS "Users can view own blocks" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can unblock" ON public.blocked_users;

-- Status Updates
DROP POLICY IF EXISTS "Users can view status" ON public.status_updates;
DROP POLICY IF EXISTS "Users can create status" ON public.status_updates;
DROP POLICY IF EXISTS "Users can delete own status" ON public.status_updates;

-- Status Views
DROP POLICY IF EXISTS "Users can view status views" ON public.status_views;
DROP POLICY IF EXISTS "Users can insert status views" ON public.status_views;

-- Calls
DROP POLICY IF EXISTS "Users can view calls" ON public.calls;
DROP POLICY IF EXISTS "Users can insert calls" ON public.calls;

-- AI Conversations
DROP POLICY IF EXISTS "Users can view own ai conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can insert own ai conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can delete own ai conversations" ON public.ai_conversations;

-- Voice Note Transcripts
DROP POLICY IF EXISTS "Users can view voice transcripts" ON public.voice_note_transcripts;
DROP POLICY IF EXISTS "Users can insert voice transcripts" ON public.voice_note_transcripts;


-- ============================================================
-- 6. RLS POLICIES — USERS
-- ============================================================

-- SELECT: users can read all profiles BUT push_token is excluded from general reads
-- (push_token is only accessible via the get_push_token() security definer function)
create policy "Users can view all profiles"
  on public.users for select
  to authenticated
  using (true);

-- INSERT: users can only insert their own profile (auto-created by trigger)
create policy "Users can insert own profile"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

-- UPDATE: users can only update their own profile
create policy "Users can update own profile"
  on public.users for update
  to authenticated
  using (auth.uid() = id);

-- ============================================================
-- 7. RLS POLICIES — CHANNELS
-- ============================================================

-- SELECT: can view if you can access the channel (member, follower, or creator)
-- Allows all authenticated users to see broadcast channels for discovery
create policy "Users can view channels"
  on public.channels for select
  to authenticated
  using (true);

-- INSERT: any authenticated user can create a channel (created_by must be self)
create policy "Users can create channels"
  on public.channels for insert
  to authenticated
  with check (created_by = auth.uid());

-- UPDATE: only creator can update
create policy "Users can update channels"
  on public.channels for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- DELETE: only creator can delete
create policy "Users can delete channels"
  on public.channels for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- 8. RLS POLICIES — CHANNEL MEMBERS
-- ============================================================

-- SELECT: can view members if you can access the channel
create policy "Users can view channel_members"
  on public.channel_members for select
  to authenticated
  using (public.can_access_channel(channel_id));

-- INSERT: can add yourself, OR channel creator can add others
-- BUT for DM channels, only the two participants themselves can be added
-- (prevents force-adding a user to a DM by someone else)
create policy "Users can add members"
  on public.channel_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
        and channels.channel_type != 'dm'  -- DM channels cannot have force-added members
    )
  );

-- DELETE: can remove yourself, OR channel creator can remove anyone
create policy "Users can remove members"
  on public.channel_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
    )
  );

-- UPDATE: users can update their own membership row (for read status, mute, archive, pin)
create policy "Users can update own membership"
  on public.channel_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 9. RLS POLICIES — MESSAGES
-- ============================================================

-- SELECT: can view if you can access the channel
create policy "Users can view messages"
  on public.messages for select
  to authenticated
  using (public.can_access_channel(channel_id));

-- INSERT: can insert if:
--   - sender is self, AND
--   - (channel is dm/group and you're a member AND rate limit not exceeded) OR
--   - (channel is broadcast and you're the creator)
create policy "Users can insert messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      exists (
        select 1 from public.channels c
        where c.id = channel_id
          and c.channel_type = 'broadcast'
          and c.created_by = auth.uid()
      )
      or (
        exists (
          select 1 from public.channels c
          where c.id = channel_id
            and c.channel_type != 'broadcast'
        )
        and public.is_channel_member(channel_id)
        and public.check_message_rate_limit()
      )
    )
  );

-- UPDATE: own messages, OR channel creator can update any message
create policy "Users can update messages"
  on public.messages for update
  to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
    )
  )
  with check (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
    )
  );

-- DELETE: own messages, OR channel creator can delete any message
create policy "Users can delete messages"
  on public.messages for delete
  to authenticated
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
    )
  );

-- ============================================================
-- 10. RLS POLICIES — MESSAGE REACTIONS
-- ============================================================

-- SELECT: can view reactions if you can access the channel the message is in
create policy "Users can view reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.can_access_channel(m.channel_id)
    )
  );

-- INSERT: can add own reaction if you can access the message's channel
create policy "Users can insert reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.can_access_channel(m.channel_id)
    )
  );

-- DELETE: can only remove own reactions
create policy "Users can delete reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 11. RLS POLICIES — CHANNEL FOLLOWERS
-- ============================================================

-- INSERT: can only follow as yourself
create policy "Users can follow/unfollow channels"
  on public.channel_followers for insert
  to authenticated
  with check (user_id = auth.uid());

-- SELECT: any authenticated user can view followers (for counts)
create policy "Users can view followers"
  on public.channel_followers for select
  to authenticated
  using (true);

-- DELETE: can only unfollow yourself
create policy "Users can unfollow"
  on public.channel_followers for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 12. RLS POLICIES — BLOCKED USERS
-- ============================================================

-- SELECT: can only view your own block list
create policy "Users can view own blocks"
  on public.blocked_users for select
  to authenticated
  using (blocker_id = auth.uid());

-- INSERT: can only block others (blocker must be self)
create policy "Users can block others"
  on public.blocked_users for insert
  to authenticated
  with check (blocker_id = auth.uid());

-- DELETE: can only unblock yourself
create policy "Users can unblock"
  on public.blocked_users for delete
  to authenticated
  using (blocker_id = auth.uid());

-- ============================================================
-- 13. RLS POLICIES — STATUS UPDATES
-- ============================================================

-- SELECT: can view own status or statuses of users you share a channel with
create policy "Users can view status"
  on public.status_updates for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.channel_members cm
      where cm.user_id = status_updates.user_id
        and exists (
          select 1 from public.channel_members cm2
          where cm2.channel_id = cm.channel_id
            and cm2.user_id = auth.uid()
        )
    )
  );

-- INSERT: can only create your own status
create policy "Users can create status"
  on public.status_updates for insert
  to authenticated
  with check (user_id = auth.uid());

-- DELETE: can only delete your own status
create policy "Users can delete own status"
  on public.status_updates for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 14. RLS POLICIES — STATUS VIEWS
-- ============================================================

-- SELECT: can view if you're the viewer or the status owner
create policy "Users can view status views"
  on public.status_views for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.status_updates
      where status_updates.id = status_id
        and status_updates.user_id = auth.uid()
    )
  );

-- INSERT: can only view as yourself
create policy "Users can insert status views"
  on public.status_views for insert
  to authenticated
  with check (viewer_id = auth.uid());

-- ============================================================
-- 15. RLS POLICIES — CALLS
-- ============================================================

-- SELECT: can view calls you participated in
create policy "Users can view calls"
  on public.calls for select
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

-- INSERT: can only initiate calls as yourself
create policy "Users can insert calls"
  on public.calls for insert
  to authenticated
  with check (caller_id = auth.uid());

-- ============================================================
-- 16. RLS POLICIES — AI CONVERSATIONS
-- ============================================================

-- SELECT: can only view your own AI conversations
create policy "Users can view own ai conversations"
  on public.ai_conversations for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: can only insert your own AI conversation messages
create policy "Users can insert own ai conversations"
  on public.ai_conversations for insert
  to authenticated
  with check (user_id = auth.uid());

-- DELETE: can only delete your own AI conversations
create policy "Users can delete own ai conversations"
  on public.ai_conversations for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 17. RLS POLICIES — VOICE NOTE TRANSCRIPTS
-- ============================================================

-- SELECT: can view transcripts if you can access the channel the message is in
create policy "Users can view voice transcripts"
  on public.voice_note_transcripts for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = voice_note_transcripts.message_id
        and public.can_access_channel(m.channel_id)
    )
  );

-- INSERT: can insert if you can access the message's channel
create policy "Users can insert voice transcripts"
  on public.voice_note_transcripts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.can_access_channel(m.channel_id)
    )
  );


-- ============================================================
-- 18. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_channel_members_archived
  ON public.channel_members (channel_id, user_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_channel_members_pinned
  ON public.channel_members (user_id, pinned_at)
  WHERE pinned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_members_last_read
  ON public.channel_members (channel_id, user_id, last_read_message_id);

CREATE INDEX IF NOT EXISTS idx_channel_members_muted
  ON public.channel_members (channel_id, user_id, muted_until);

CREATE INDEX IF NOT EXISTS idx_messages_scheduled_at
  ON public.messages (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker
  ON public.blocked_users (blocker_id, blocked_id);


-- ============================================================
-- 19. TRIGGERS
-- ============================================================

-- Auto-generate invite code on channel create
create or replace function public.set_invite_code()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.invite_code is null then
    new.invite_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_invite_code on public.channels;
create trigger trg_set_invite_code
  before insert on public.channels
  for each row execute function public.set_invite_code();

-- Update member count on channel_members insert/delete
create or replace function public.update_channel_member_count()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    update public.channels
    set member_count = (select count(*) from public.channel_members where channel_id = new.channel_id)
    where id = new.channel_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.channels
    set member_count = (select count(*) from public.channel_members where channel_id = old.channel_id)
    where id = old.channel_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_update_member_count_insert on public.channel_members;
create trigger trg_update_member_count_insert
  after insert on public.channel_members
  for each row execute function public.update_channel_member_count();

drop trigger if exists trg_update_member_count_delete on public.channel_members;
create trigger trg_update_member_count_delete
  after delete on public.channel_members
  for each row execute function public.update_channel_member_count();

-- Update follower count on channel_followers insert/delete
create or replace function public.update_channel_follower_count()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    update public.channels
    set follower_count = (select count(*) from public.channel_followers where channel_id = new.channel_id)
    where id = new.channel_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.channels
    set follower_count = (select count(*) from public.channel_followers where channel_id = old.channel_id)
    where id = old.channel_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_update_follower_count_insert on public.channel_followers;
create trigger trg_update_follower_count_insert
  after insert on public.channel_followers
  for each row execute function public.update_channel_follower_count();

drop trigger if exists trg_update_follower_count_delete on public.channel_followers;
create trigger trg_update_follower_count_delete
  after delete on public.channel_followers
  for each row execute function public.update_channel_follower_count();

-- Mark channel read function
create or replace function public.mark_channel_read(channel_id uuid, message_id uuid)
returns void
language sql
security definer
as $$
  update public.channel_members
  set last_read_message_id = message_id
  where channel_id = $1
    and user_id = auth.uid();
$$;

-- ============================================================
-- 20. AUTO-CREATE USER PROFILES ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_username text;
begin
  new_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    'u' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  );
  new_username := lower(new_username);

  insert into public.users (id, display_name, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'User'),
    new_username,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
