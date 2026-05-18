
ALTER ROLE authenticator SET pgrst.db_schemas = 'public,cost_intelligence';
ALTER ROLE anon SET pgrst.db_schemas = 'public,cost_intelligence';
ALTER ROLE authenticated SET pgrst.db_schemas = 'public,cost_intelligence';
ALTER ROLE service_role SET pgrst.db_schemas = 'public,cost_intelligence';
GRANT USAGE ON SCHEMA cost_intelligence TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA cost_intelligence TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cost_intelligence TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cost_intelligence TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA cost_intelligence GRANT ALL ON TABLES TO service_role;
NOTIFY pgrst, 'reload config';
