-- ============================================================
-- ChatBuddy - Username Migration
-- Adds @username-based search (Telegram-style)
-- Safe to run multiple times
-- ============================================================

-- 1. Add username column (unique, lowercase)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text;

-- Add unique constraint (separately to handle existing nulls)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_key'
      AND conrelid = 'public.users'::regclass
  ) THEN
    -- First, ensure all existing rows have a username
    -- Then add the constraint
    ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- 2. Backfill existing users who don't have a username
DO $$
DECLARE
  user_rec RECORD;
  base_username text;
  final_username text;
  counter integer;
BEGIN
  FOR user_rec IN 
    SELECT u.id, u.display_name, au.email 
    FROM public.users u
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE u.username IS NULL OR u.username = ''
  LOOP
    -- Generate base username from email prefix or display_name
    base_username := lower(coalesce(
      split_part(user_rec.email, '@', 1),
      regexp_replace(lower(user_rec.display_name), '[^a-z0-9_]', '', 'g'),
      'user'
    ));
    
    -- Clean: only allow a-z, 0-9, underscore
    base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
    
    -- Ensure minimum length
    IF length(base_username) < 2 THEN
      base_username := 'user';
    END IF;
    
    -- Ensure uniqueness
    final_username := base_username;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM public.users WHERE username = final_username AND id != user_rec.id) LOOP
      final_username := base_username || counter::text;
      counter := counter + 1;
    END LOOP;
    
    UPDATE public.users SET username = final_username WHERE id = user_rec.id;
  END LOOP;
END $$;

-- 3. Update handle_new_user trigger to include username
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_username text;
begin
  -- Generate username from metadata or fallback
  new_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    'u' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  );
  -- Ensure lowercase
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

-- Recreate the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
