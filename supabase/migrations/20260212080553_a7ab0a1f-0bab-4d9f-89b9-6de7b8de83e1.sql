
-- Remove the overly permissive policy - edge function uses service role key
DROP POLICY IF EXISTS "Public can view visits by acceptance token" ON public.visits;
