
-- Fix 1: Restrict company_settings SELECT to elevated roles (contains bank details)
DROP POLICY IF EXISTS "Authenticated users can view company settings" ON public.company_settings;
CREATE POLICY "Elevated users can view company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (has_elevated_role(auth.uid()));

-- Fix 2: Restrict microsoft_tokens to finance/admin roles only (not engineers)
DROP POLICY IF EXISTS "Elevated users can manage microsoft tokens" ON public.microsoft_tokens;
DROP POLICY IF EXISTS "Elevated users can view microsoft token metadata" ON public.microsoft_tokens;
CREATE POLICY "Finance users can manage microsoft tokens"
  ON public.microsoft_tokens
  FOR ALL
  TO authenticated
  USING (has_finance_role(auth.uid()))
  WITH CHECK (has_finance_role(auth.uid()));

-- Fix 3: Restrict xero_connections tokens - drop direct access policies, keep safe view
DROP POLICY IF EXISTS "Users can manage own xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Users can view own xero connections" ON public.xero_connections;
CREATE POLICY "Service role only for xero connections"
  ON public.xero_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix 4: Restrict credit_control_reminders to finance roles
DROP POLICY IF EXISTS "Elevated users can manage reminders" ON public.credit_control_reminders;
DROP POLICY IF EXISTS "Elevated users can view reminders" ON public.credit_control_reminders;
CREATE POLICY "Finance users can manage reminders"
  ON public.credit_control_reminders
  FOR ALL
  TO authenticated
  USING (has_finance_role(auth.uid()))
  WITH CHECK (has_finance_role(auth.uid()));
CREATE POLICY "Finance users can view reminders"
  ON public.credit_control_reminders
  FOR SELECT
  TO authenticated
  USING (has_finance_role(auth.uid()));

-- Fix 5: Restrict credit_control_exclusions to finance roles
DROP POLICY IF EXISTS "Elevated users can manage exclusions" ON public.credit_control_exclusions;
DROP POLICY IF EXISTS "Elevated users can view exclusions" ON public.credit_control_exclusions;
CREATE POLICY "Finance users can manage exclusions"
  ON public.credit_control_exclusions
  FOR ALL
  TO authenticated
  USING (has_finance_role(auth.uid()))
  WITH CHECK (has_finance_role(auth.uid()));

-- Fix 6: Restrict credit_control_schedules/steps to finance roles
DROP POLICY IF EXISTS "Elevated users can manage schedules" ON public.credit_control_schedules;
DROP POLICY IF EXISTS "Elevated users can view schedules" ON public.credit_control_schedules;
CREATE POLICY "Finance users can manage schedules"
  ON public.credit_control_schedules
  FOR ALL
  TO authenticated
  USING (has_finance_role(auth.uid()))
  WITH CHECK (has_finance_role(auth.uid()));

DROP POLICY IF EXISTS "Elevated users can manage steps" ON public.credit_control_steps;
DROP POLICY IF EXISTS "Elevated users can view steps" ON public.credit_control_steps;
CREATE POLICY "Finance users can manage steps"
  ON public.credit_control_steps
  FOR ALL
  TO authenticated
  USING (has_finance_role(auth.uid()))
  WITH CHECK (has_finance_role(auth.uid()));

-- Fix 7: Restrict qms_documents public SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view approved documents" ON public.qms_documents;
CREATE POLICY "Authenticated can view approved documents"
  ON public.qms_documents
  FOR SELECT
  TO authenticated
  USING (status = 'approved' OR has_elevated_role(auth.uid()));

-- Fix 8: Restrict qms_document_versions to elevated roles
DROP POLICY IF EXISTS "Users can view document versions" ON public.qms_document_versions;
CREATE POLICY "Elevated users can view document versions"
  ON public.qms_document_versions
  FOR SELECT
  TO authenticated
  USING (has_elevated_role(auth.uid()));

-- Fix 9: Restrict data_retention_policies SELECT to finance roles
DROP POLICY IF EXISTS "Authenticated can view retention policies" ON public.data_retention_policies;
CREATE POLICY "Finance users can view retention policies"
  ON public.data_retention_policies
  FOR SELECT
  TO authenticated
  USING (has_finance_role(auth.uid()));
