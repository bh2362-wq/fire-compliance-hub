
-- Allow elevated users to manage user_roles
CREATE POLICY "Elevated users can insert user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can view all user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_elevated_role(auth.uid()));
