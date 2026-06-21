-- ============================================================
-- ChatBuddy - Phase 1: Supabase Backend Setup
-- Run this entire script in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. USERS TABLE
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  status text,
  push_token text,
  last_seen timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.users enable row level security;

-- 2. CHANNELS TABLE
create table public.channels (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  is_group boolean default true,
  icon_url text,
  created_by uuid references public.users(id),
  created_at timestamp with time zone default now()
);

alter table public.channels enable row level security;

-- 3. CHANNEL MEMBERS (join table for RLS checks)
create table public.channel_members (
  channel_id uuid references public.channels(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamp with time zone default now(),
  primary key (channel_id, user_id)
);

alter table public.channel_members enable row level security;

-- 4. MESSAGES TABLE
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references public.channels(id) on delete cascade,
  sender_id uuid references public.users(id),
  content text,
  file_url text,
  reply_to_id uuid references public.messages(id),
  created_at timestamp with time zone default now(),
  edited_at timestamp with time zone
);

alter table public.messages enable row level security;

-- 5. MESSAGE REACTIONS TABLE
create table public.message_reactions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamp with time zone default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- USERS: anyone auth'd can read, only yourself can update
create policy "Users can view all profiles"
  on public.users for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.users for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

-- CHANNELS: visible to members only
create policy "Members can view channels"
  on public.channels for select
  to authenticated
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = channels.id
        and user_id = auth.uid()
    )
  );

create policy "Members can create channels"
  on public.channels for insert
  to authenticated
  with check (true);

-- Create a security definer function to check channel membership
-- This avoids infinite recursion in RLS policies
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

-- CHANNEL MEMBERS: can read if you're a member, can insert if creating
create policy "Members can view channel_members"
  on public.channel_members for select
  to authenticated
  using (public.is_channel_member(channel_id));

create policy "Members can add themselves"
  on public.channel_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- Also update other policies that reference channel_members to use the function
-- to avoid potential cascading recursion

drop policy if exists "Members can view channels" on public.channels;
create policy "Members can view channels"
  on public.channels for select
  to authenticated
  using (public.is_channel_member(id));

drop policy if exists "Members can view messages" on public.messages;
create policy "Members can view messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = messages.channel_id
        and user_id = auth.uid()
    )
  );

drop policy if exists "Members can insert messages" on public.messages;
create policy "Members can insert messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_channel_member(channel_id)
  );

drop policy if exists "Members can view reactions" on public.message_reactions;
create policy "Members can view reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_channel_member(m.channel_id)
    )
  );

-- MESSAGES: read if in channel, insert as self in joined channels
create policy "Members can view messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = messages.channel_id
        and user_id = auth.uid()
    )
  );

create policy "Members can insert messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.channel_members
      where channel_id = messages.channel_id
        and user_id = auth.uid()
    )
  );

create policy "Users can update own messages"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid());

create policy "Users can delete own messages"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- REACTIONS: read if in channel, insert as self
create policy "Members can view reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      join public.channel_members cm on cm.channel_id = m.channel_id
      where m.id = message_reactions.message_id
        and cm.user_id = auth.uid()
    )
  );

create policy "Users can insert own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- AUTO-CREATE USER PROFILES ON SIGNUP
-- When a new user signs up via Supabase Auth, this trigger
-- automatically inserts a row into public.users.
-- This is REQUIRED when email confirmation is enabled.
-- ============================================================

-- Function that runs on auth.users insert
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

-- Trigger on auth.users after insert
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- REALTIME (enable on messages, message_reactions, users)
-- ============================================================
-- Run these in Supabase Dashboard > Database > Replication
-- Enable "Insert", "Update", "Delete" for:
--   - public.messages
--   - public.message_reactions
--   - public.users
-- 
-- Or run SQL:
-- (Note: Supabase manages Realtime via the UI, the SQL may vary)

-- ============================================================
-- STORAGE
-- ============================================================
-- Create a bucket called "chat-media" in Supabase Dashboard > Storage
-- Or run:
-- (Note: Storage bucket creation is done via UI or Management API)
