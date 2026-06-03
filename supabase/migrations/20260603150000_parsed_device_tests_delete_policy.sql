-- parsed_device_tests has SELECT and INSERT policies for elevated users
-- but no DELETE — so the visit wizard's "Clear pass" and "Clear test
-- results" bulk actions silently no-op (RLS filters every row out of
-- the DELETE, no rows affected, no error). Mirror the existing
-- "Elevated users can …" pattern so the same role that can record
-- a test can also retract one.

CREATE POLICY "Elevated users can delete parsed tests"
  ON public.parsed_device_tests
  FOR DELETE
  TO authenticated
  USING (public.has_elevated_role(auth.uid()));
