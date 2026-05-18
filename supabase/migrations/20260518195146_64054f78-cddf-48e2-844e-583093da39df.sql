CREATE SCHEMA IF NOT EXISTS reference_library;
CREATE SCHEMA IF NOT EXISTS tenders;
GRANT USAGE ON SCHEMA reference_library TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA tenders TO anon, authenticated, service_role;