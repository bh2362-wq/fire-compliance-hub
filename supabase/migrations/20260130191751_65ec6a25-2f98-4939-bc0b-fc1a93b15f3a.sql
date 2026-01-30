-- Add DELETE policy for sites table (currently missing)
CREATE POLICY "Elevated users can delete sites"
ON public.sites
FOR DELETE
USING (has_elevated_role(auth.uid()));