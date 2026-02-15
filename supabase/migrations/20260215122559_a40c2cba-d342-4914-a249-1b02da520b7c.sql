
-- Fix SECURITY DEFINER views by setting them to SECURITY INVOKER
ALTER VIEW public.xero_connections_safe SET (security_invoker = on);
ALTER VIEW public.microsoft_tokens_safe SET (security_invoker = on);

-- Add RLS-like access via the views by granting SELECT to authenticated role
-- Views with security_invoker will check RLS on the underlying table
-- But we dropped the SELECT policies, so we need view-specific access

-- Re-add limited SELECT policies on the underlying tables that only work through authenticated access
-- These are safe because the views only expose non-sensitive columns
CREATE POLICY "Users can view own xero connection metadata"
ON public.xero_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Elevated users can view microsoft token metadata"
ON public.microsoft_tokens
FOR SELECT
USING (has_elevated_role(auth.uid()));
