-- Add unique constraint on user_id and tenant_id for upsert to work
ALTER TABLE public.xero_connections 
ADD CONSTRAINT xero_connections_user_tenant_unique UNIQUE (user_id, tenant_id);