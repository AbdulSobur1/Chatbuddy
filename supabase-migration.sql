-- ============================================================
-- ChatBuddy - Migration: RLS Fix + Trigger
-- Safe to run multiple times (all use IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- 1. Security definer function to break RLS infinite recursion
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

-- 2. Fix channel_members policy (was causing infinite recursion)
drop policy if exists "Members can view channel_members" on public.channel_members;
create policy "Members can view channel_members"
  on public.channel_members for select
  to authenticated
  using (public.is_channel_member(channel_id));

-- 3. Fix channels policy to use the function
drop policy if exists "Members can view channels" on public.channels;
create policy "Members can view channels"
  on public.channels for select
  to authenticated
  using (public.is_channel_member(id));

-- 4. Fix messages view policy
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

-- 5. Fix messages insert policy
drop policy if exists "Members can insert messages" on public.messages;
create policy "Members can insert messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_channel_member(channel_id)
  );

-- 6. Fix reactions view policy
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

-- 7. Auto-create user profiles on signup (function)
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

-- 8. Trigger on auth.users after insert (drop before create since PostgreSQL doesn't support CREATE OR REPLACE TRIGGER)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
