-- ============================================================
-- ChatBuddy - Final Comprehensive RLS Fix
-- Drops ALL existing policies on core tables and recreates them
-- with proper creator override and broadcast channel support.
-- Safe to run multiple times (all use DROP IF EXISTS).
-- ============================================================

-- ============================================================
-- 1. SECURITY DEFINER FUNCTIONS (must exist before policies)
-- ============================================================

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
-- 2. CHANNELS POLICIES
-- ============================================================

drop policy if exists "Users can view channels" on public.channels;
drop policy if exists "Users can create channels" on public.channels;
drop policy if exists "Users can update channels" on public.channels;
drop policy if exists "Users can delete channels" on public.channels;
drop policy if exists "Members can view channels" on public.channels;
drop policy if exists "Members can create channels" on public.channels;
drop policy if exists "Anyone can view broadcast channels" on public.channels;
drop policy if exists "Creator can update channels" on public.channels;

-- SELECT: can view if you can access (member, follower, or creator)
create policy "Users can view channels"
  on public.channels for select
  to authenticated
  using (public.can_access_channel(id));

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
-- 3. CHANNEL MEMBERS POLICIES
-- ============================================================

drop policy if exists "Users can view channel_members" on public.channel_members;
drop policy if exists "Users can add members" on public.channel_members;
drop policy if exists "Users can remove members" on public.channel_members;
drop policy if exists "Members can view channel_members" on public.channel_members;
drop policy if exists "Members can add themselves" on public.channel_members;
drop policy if exists "Members can add members" on public.channel_members;
drop policy if exists "Members can remove members" on public.channel_members;

-- SELECT: can view members if you're a member, follower, or creator of the channel
create policy "Users can view channel_members"
  on public.channel_members for select
  to authenticated
  using (public.can_access_channel(channel_id));

-- INSERT: can add yourself, or channel creator can add others
create policy "Users can add members"
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

-- DELETE: can remove yourself, or channel creator can remove anyone
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

-- ============================================================
-- 4. MESSAGES POLICIES
-- ============================================================

drop policy if exists "Users can view messages" on public.messages;
drop policy if exists "Users can insert messages" on public.messages;
drop policy if exists "Users can update messages" on public.messages;
drop policy if exists "Users can delete messages" on public.messages;
drop policy if exists "Members can view messages" on public.messages;
drop policy if exists "Members can insert messages" on public.messages;
drop policy if exists "Users can update own messages" on public.messages;
drop policy if exists "Users can delete own messages" on public.messages;

-- SELECT: can view if you can access the channel
create policy "Users can view messages"
  on public.messages for select
  to authenticated
  using (public.can_access_channel(channel_id));

-- INSERT: can insert if:
--   - sender is self, AND
--   - (channel is dm/group and you're a member) OR (channel is broadcast and you're the creator)
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
-- 5. MESSAGE REACTIONS POLICIES
-- ============================================================

drop policy if exists "Users can view reactions" on public.message_reactions;
drop policy if exists "Users can insert reactions" on public.message_reactions;
drop policy if exists "Users can delete reactions" on public.message_reactions;
drop policy if exists "Members can view reactions" on public.message_reactions;
drop policy if exists "Users can insert own reactions" on public.message_reactions;
drop policy if exists "Users can delete own reactions" on public.message_reactions;

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

create policy "Users can delete reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 6. CHANNEL FOLLOWERS POLICIES
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
-- 7. VERIFY channel_type COLUMN EXISTS WITH DEFAULT
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channels'
      AND column_name = 'channel_type'
  ) THEN
    ALTER TABLE public.channels ADD COLUMN channel_type text NOT NULL DEFAULT 'dm';
  END IF;
  
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

-- ============================================================
-- 8. BACKFILL: Set channel_type for any existing channels
-- that have NULL channel_type (from before the column existed)
-- ============================================================

UPDATE public.channels
SET channel_type = CASE
  WHEN is_group = true THEN 'group'
  ELSE 'dm'
END
WHERE channel_type IS NULL;
