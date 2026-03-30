
-- Fix 1: Remove overly permissive SELECT on qms_document_acknowledgements
DROP POLICY IF EXISTS "Users can view acknowledgements" ON public.qms_document_acknowledgements;
CREATE POLICY "Authenticated users can view own acknowledgements"
  ON public.qms_document_acknowledgements
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR has_elevated_role(auth.uid()));

-- Fix 2: Tighten customer_intelligence_reports - already has elevated-only ALL policy
-- but the ALL policy applies to public role, restrict to authenticated
DROP POLICY IF EXISTS "Elevated users can manage intelligence reports" ON public.customer_intelligence_reports;
CREATE POLICY "Elevated users can manage intelligence reports"
  ON public.customer_intelligence_reports
  FOR ALL
  TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));
