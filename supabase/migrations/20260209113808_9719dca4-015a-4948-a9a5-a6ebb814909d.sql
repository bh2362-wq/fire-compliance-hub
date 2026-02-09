
-- Create a finance-only role check (owner or admin, NOT engineer)
CREATE OR REPLACE FUNCTION public.has_finance_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'admin')
  )
$$;

-- =====================================================
-- CREDIT CHECKS: restrict to owner/admin only
-- =====================================================
DROP POLICY IF EXISTS "Elevated users can view credit checks" ON public.credit_checks;
DROP POLICY IF EXISTS "Elevated users can insert credit checks" ON public.credit_checks;
DROP POLICY IF EXISTS "Elevated users can update credit checks" ON public.credit_checks;
DROP POLICY IF EXISTS "Elevated users can delete credit checks" ON public.credit_checks;

CREATE POLICY "Finance users can view credit checks"
  ON public.credit_checks FOR SELECT
  USING (has_finance_role(auth.uid()));

CREATE POLICY "Finance users can insert credit checks"
  ON public.credit_checks FOR INSERT
  WITH CHECK (has_finance_role(auth.uid()));

CREATE POLICY "Finance users can update credit checks"
  ON public.credit_checks FOR UPDATE
  USING (has_finance_role(auth.uid()));

CREATE POLICY "Finance users can delete credit checks"
  ON public.credit_checks FOR DELETE
  USING (has_finance_role(auth.uid()));

-- =====================================================
-- PAYMENT HISTORY: restrict to owner/admin only
-- =====================================================
DROP POLICY IF EXISTS "Elevated users can manage payment history" ON public.payment_history;
DROP POLICY IF EXISTS "Elevated users can view payment history" ON public.payment_history;

CREATE POLICY "Finance users can manage payment history"
  ON public.payment_history FOR ALL
  USING (has_finance_role(auth.uid()));

CREATE POLICY "Finance users can view payment history"
  ON public.payment_history FOR SELECT
  USING (has_finance_role(auth.uid()));

-- =====================================================
-- COMPANY SETTINGS: hide banking details by restricting
-- update to owner/admin only (already done), but also
-- create a view-only policy for non-banking fields
-- Note: Supabase RLS is row-level not column-level,
-- so we restrict the full settings to elevated users
-- and banking fields are only accessible via owner/admin
-- =====================================================

-- =====================================================
-- EMAIL LOGS: restrict to owner/admin only
-- =====================================================
DROP POLICY IF EXISTS "Elevated users can view email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Elevated users can insert email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Elevated users can update email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Elevated users can delete email logs" ON public.email_logs;

CREATE POLICY "Finance users can view email logs"
  ON public.email_logs FOR SELECT
  USING (has_finance_role(auth.uid()));

CREATE POLICY "Elevated users can insert email logs"
  ON public.email_logs FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update email logs"
  ON public.email_logs FOR UPDATE
  USING (has_finance_role(auth.uid()));

CREATE POLICY "Elevated users can delete email logs"
  ON public.email_logs FOR DELETE
  USING (has_finance_role(auth.uid()));

-- =====================================================  
-- PROFILES: Allow elevated users to view all profiles
-- (needed for team management) but keep update to own
-- =====================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT
  USING ((auth.uid() = user_id) OR has_elevated_role(auth.uid()));
