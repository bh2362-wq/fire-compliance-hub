
-- Allow elevated users to insert profiles (for adding engineers manually)
CREATE POLICY "Elevated users can insert profiles"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (has_elevated_role(auth.uid()));
