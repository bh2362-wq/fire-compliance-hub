
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can view active shared reports via token" ON public.customer_intelligence_reports;

-- Create a security definer function for token-based access
CREATE OR REPLACE FUNCTION public.get_shared_intelligence_report(p_share_token text)
RETURNS SETOF customer_intelligence_reports
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM customer_intelligence_reports
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;
