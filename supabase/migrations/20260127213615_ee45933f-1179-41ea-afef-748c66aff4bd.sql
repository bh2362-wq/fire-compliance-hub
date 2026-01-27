-- Add DELETE policy for elevated users on devices table
CREATE POLICY "Elevated users can delete devices"
ON public.devices
FOR DELETE
USING (has_elevated_role(auth.uid()));