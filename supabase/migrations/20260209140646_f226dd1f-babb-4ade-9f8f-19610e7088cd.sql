
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Finance users can manage microsoft tokens" ON public.microsoft_tokens;
DROP POLICY IF EXISTS "Finance users can view microsoft tokens" ON public.microsoft_tokens;

-- Create new policies that allow elevated roles (owner, admin, engineer)
CREATE POLICY "Elevated users can view microsoft tokens"
ON public.microsoft_tokens
FOR SELECT
USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage microsoft tokens"
ON public.microsoft_tokens
FOR ALL
USING (public.has_elevated_role(auth.uid()))
WITH CHECK (public.has_elevated_role(auth.uid()));
