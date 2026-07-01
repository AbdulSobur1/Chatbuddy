-- ============================================================
-- ChatBuddy — Fix: Rate limiting + Follower count issues
-- ============================================================
-- Fixes:
--   1. 'cannot cast type integer to interval' error
--   2. Messages not sending to groups/DMs (rate limiter)
--   3. Follower count type mismatches
-- ============================================================

-- 1. Drop the old rate-limiting RLS policy that uses check_message_rate_limit()
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;

-- 2. Recreate the policy WITHOUT the rate limiter
-- The rate limiter was causing 'cannot cast type integer to interval' errors
-- and blocking legitimate messages.
CREATE POLICY "Users can insert messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      -- Broadcast channels: only creator can post
      EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = channel_id
          AND c.channel_type = 'broadcast'
          AND c.created_by = auth.uid()
      )
      OR (
        -- DM/Group channels: must be a member
        EXISTS (
          SELECT 1 FROM public.channels c
          WHERE c.id = channel_id
            AND c.channel_type != 'broadcast'
        )
        AND public.is_channel_member(channel_id)
      )
    )
  );

-- 3. Remove old follower_count trigger to avoid type issues
DROP TRIGGER IF EXISTS trg_update_follower_count_insert ON public.channel_followers;
DROP TRIGGER IF EXISTS trg_update_follower_count_delete ON public.channel_followers;
DROP FUNCTION IF EXISTS public.update_channel_follower_count();

-- 4. Recreate the follower_count function with proper search_path
CREATE OR REPLACE FUNCTION public.update_channel_follower_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels
    SET follower_count = (SELECT COUNT(*)::integer FROM public.channel_followers WHERE channel_id = NEW.channel_id)
    WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels
    SET follower_count = (SELECT COUNT(*)::integer FROM public.channel_followers WHERE channel_id = OLD.channel_id)
    WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 5. Recreate the triggers
CREATE TRIGGER trg_update_follower_count_insert
  AFTER INSERT ON public.channel_followers
  FOR EACH ROW EXECUTE FUNCTION public.update_channel_follower_count();

CREATE TRIGGER trg_update_follower_count_delete
  AFTER DELETE ON public.channel_followers
  FOR EACH ROW EXECUTE FUNCTION public.update_channel_follower_count();

-- 6. Also fix the member_count trigger for consistency
DROP TRIGGER IF EXISTS trg_update_member_count_insert ON public.channel_members;
DROP TRIGGER IF EXISTS trg_update_member_count_delete ON public.channel_members;
DROP FUNCTION IF EXISTS public.update_channel_member_count();

CREATE OR REPLACE FUNCTION public.update_channel_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels
    SET member_count = (SELECT COUNT(*)::integer FROM public.channel_members WHERE channel_id = NEW.channel_id)
    WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels
    SET member_count = (SELECT COUNT(*)::integer FROM public.channel_members WHERE channel_id = OLD.channel_id)
    WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_update_member_count_insert
  AFTER INSERT ON public.channel_members
  FOR EACH ROW EXECUTE FUNCTION public.update_channel_member_count();

CREATE TRIGGER trg_update_member_count_delete
  AFTER DELETE ON public.channel_members
  FOR EACH ROW EXECUTE FUNCTION public.update_channel_member_count();
