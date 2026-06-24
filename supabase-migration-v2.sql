-- ============================================================
-- ChatBuddy - Phase 2: Full Feature Migration
-- Safe to run multiple times (all use IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- ============================================================
-- 1. SCHEMA UPDATES
-- ============================================================

-- Add channel_type to channels table (dm, group, broadcast)
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS channel_type text NOT NULL DEFAULT 'dm';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS member_count integer DEFAULT 0;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS follower_count integer DEFAULT 0;

-- CHANNEL FOLLOWERS (for broadcast channels — one-way follow, no posting)
CREATE TABLE IF NOT EXISTS public.channel_followers (
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  followed_at timestamp with time zone DEFAULT now(),
  primary key (channel_id, user_id)
);

ALTER TABLE public.channel_followers ENABLE ROW LEVEL SECURITY;

-- STATUS UPDATES (like WhatsApp Status / Stories)
CREATE TABLE IF NOT EXISTS public.status_updates (
  id uuid DEFAULT gen_random_uuid() primary key,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content text,
  media_url text,
  media_type text DEFAULT 'text', -- text, image, video
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.status_updates ENABLE ROW LEVEL SECURITY;

-- STATUS VIEWS (track who viewed each status)
CREATE TABLE IF NOT EXISTS public.status_views (
  status_id uuid REFERENCES public.status_updates(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone DEFAULT now(),
  primary key (status_id, viewer_id)
);

ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

-- CALLS (call log)
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid DEFAULT gen_random_uuid() primary key,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  caller_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  call_type text NOT NULL DEFAULT 'audio', -- audio, video
  status text NOT NULL DEFAULT 'missed', -- missed, answered, outgoing
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  duration integer DEFAULT 0 -- seconds
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. SECURITY DEFINER FUNCTIONS
-- ============================================================

-- is_channel_member (for groups and DMs)
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

-- is_channel_follower (for broadcast channels)
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

-- Can access channel (member for dm/group, follower for broadcast, or creator)
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

-- ============================================================
-- 3. RLS POLICIES — CHANNELS
-- ============================================================

drop policy if exists "Members can view channels" on public.channels;
drop policy if exists "Members can create channels" on public.channels;
drop policy if exists "Users can create channels" on public.channels;
drop policy if exists "Anyone can view broadcast channels" on public.channels;

-- Anyone authenticated can CREATE channels
create policy "Users can create channels"
  on public.channels for insert
  to authenticated
  with check (created_by = auth.uid());

-- View: broadcast channels visible to all; others visible to members/followers
create policy "Members can view channels"
  on public.channels for select
  to authenticated
  using (
    channel_type = 'broadcast'
    or public.is_channel_member(id)
    or public.is_channel_follower(id)
  );

-- Update: only creator/owner can update
drop policy if exists "Creator can update channels" on public.channels;
create policy "Creator can update channels"
  on public.channels for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ============================================================
-- 4. RLS POLICIES — CHANNEL MEMBERS
-- ============================================================

drop policy if exists "Members can view channel_members" on public.channel_members;
drop policy if exists "Members can add themselves" on public.channel_members;
drop policy if exists "Members can add members" on public.channel_members;
drop policy if exists "Members can remove members" on public.channel_members;

-- View: can view members if you're a member or the channel creator
create policy "Members can view channel_members"
  on public.channel_members for select
  to authenticated
  using (
    public.is_channel_member(channel_id)
    or exists (
      select 1 from public.channels
      where channels.id = channel_id
        and channels.created_by = auth.uid()
    )
  );

-- Insert: allow adding yourself + allow channel creators to add others
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

-- Delete: channel creator or self can remove
create policy "Members can remove members"
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

-- ============================================================
-- 5. RLS POLICIES — CHANNEL FOLLOWERS
-- ============================================================

drop policy if exists "Users can follow channels" on public.channel_followers;
drop policy if exists "Users can follow/unfollow channels" on public.channel_followers;
drop policy if exists "Users can view followers" on public.channel_followers;
drop policy if exists "Users can unfollow" on public.channel_followers;

create policy "Users can follow/unfollow channels"
  on public.channel_followers for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can view followers"
  on public.channel_followers for select
  to authenticated
  using (true);

create policy "Users can unfollow"
  on public.channel_followers for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 6. RLS POLICIES — MESSAGES
-- ============================================================

drop policy if exists "Members can view messages" on public.messages;
drop policy if exists "Members can insert messages" on public.messages;
drop policy if exists "Users can update own messages" on public.messages;
drop policy if exists "Users can delete own messages" on public.messages;

-- View: can view if you can access the channel
create policy "Members can view messages"
  on public.messages for select
  to authenticated
  using (public.can_access_channel(channel_id));

-- Insert: can insert if you're a member of a dm/group channel (not broadcast)
create policy "Members can insert messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.channels c
      where c.id = channel_id
        and c.channel_type != 'broadcast'
        and public.is_channel_member(c.id)
    )
  );

-- Update: own messages only
create policy "Users can update own messages"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- Delete: own messages only
create policy "Users can delete own messages"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- ============================================================
-- 7. RLS POLICIES — MESSAGE REACTIONS
-- ============================================================

drop policy if exists "Members can view reactions" on public.message_reactions;
drop policy if exists "Users can insert own reactions" on public.message_reactions;
drop policy if exists "Users can delete own reactions" on public.message_reactions;

create policy "Members can view reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.can_access_channel(m.channel_id)
    )
  );

create policy "Users can insert own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and exists (
          select 1 from public.channels c
          where c.id = m.channel_id
            and c.channel_type != 'broadcast'
            and public.is_channel_member(c.id)
        )
    )
  );

create policy "Users can delete own reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 8. RLS POLICIES — STATUS UPDATES
-- ============================================================

drop policy if exists "Users can view status" on public.status_updates;
drop policy if exists "Users can create status" on public.status_updates;
drop policy if exists "Users can delete own status" on public.status_updates;

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

create policy "Users can create status"
  on public.status_updates for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own status"
  on public.status_updates for delete
  to authenticated
  using (user_id = auth.uid());

-- Status views
drop policy if exists "Users can view status views" on public.status_views;
drop policy if exists "Users can insert status views" on public.status_views;

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

create policy "Users can insert status views"
  on public.status_views for insert
  to authenticated
  with check (viewer_id = auth.uid());

-- ============================================================
-- 9. RLS POLICIES — CALLS
-- ============================================================

drop policy if exists "Users can view calls" on public.calls;
drop policy if exists "Users can insert calls" on public.calls;

create policy "Users can view calls"
  on public.calls for select
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can insert calls"
  on public.calls for insert
  to authenticated
  with check (caller_id = auth.uid());

-- ============================================================
-- 10. TRIGGER: GENERATE INVITE CODE ON CHANNEL CREATE
-- ============================================================

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

-- ============================================================
-- 11. TRIGGER: UPDATE MEMBER COUNT (for dm/group channels)
-- ============================================================

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

-- ============================================================
-- 12. TRIGGER: UPDATE FOLLOWER COUNT (for broadcast channels)
-- ============================================================

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

-- ============================================================
-- 13. AUTO-CREATE USER PROFILES ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'User'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
