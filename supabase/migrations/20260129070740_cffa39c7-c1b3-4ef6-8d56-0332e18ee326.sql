-- Add DELETE policy for visits table to allow elevated users to delete visits
CREATE POLICY "Elevated users can delete visits"
ON public.visits
FOR DELETE
USING (has_elevated_role(auth.uid()));