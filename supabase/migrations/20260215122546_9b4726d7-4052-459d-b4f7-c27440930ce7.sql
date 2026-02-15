
-- Fix: Restrict direct SELECT access to OAuth token tables
-- Client code only needs non-sensitive columns, edge functions use service role

-- Create safe views for client access
CREATE OR REPLACE VIEW public.xero_connections_safe AS
SELECT id, user_id, tenant_id, tenant_name, expires_at, created_at, updated_at
FROM public.xero_connections;

CREATE OR REPLACE VIEW public.microsoft_tokens_safe AS
SELECT id, connected_by, connected_at, updated_at
FROM public.microsoft_tokens;

-- Drop existing SELECT policies that expose tokens
DROP POLICY IF EXISTS "Users can view own xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Elevated users can view microsoft tokens" ON public.microsoft_tokens;

-- Re-create xero SELECT policy scoped to non-token operations only
-- The view will be used for reads; direct table access only for write operations
-- Service role (edge functions) bypasses RLS and can still read tokens
