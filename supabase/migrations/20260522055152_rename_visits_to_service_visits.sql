-- Visit Documents — Step 0a: rename `visits` to `service_visits`.
--
-- The table is renamed in place. Postgres atomically rewires every foreign
-- key that points at it (service_reports.visit_id, file_uploads.visit_id,
-- and any others), along with the table's indexes, triggers and RLS
-- policies — all of which stay attached through a RENAME.
--
-- A backwards-compatibility view keeps the old name `visits` working so
-- existing application code (from("visits") calls, edge functions) keeps
-- functioning until it is migrated to service_visits in the next PR.
--
-- The view is created WITH (security_invoker = true): without it a view
-- runs with its owner's privileges and the underlying table's RLS is
-- evaluated against the owner, not the caller — which would silently
-- expose every service_visits row through the `visits` view regardless of
-- the elevated-role / acceptance-token policies. security_invoker makes
-- RLS evaluate against the calling user, preserving every existing policy.
--
-- A simple SELECT * view over one table is auto-updatable, so INSERT /
-- UPDATE / DELETE through `visits` continue to work (base-table column
-- defaults and the updated_at trigger included).
--
-- This migration is intentionally rename + view only. Client code is
-- updated to service_visits in a follow-up PR, and the view is dropped in
-- a later PR once nothing references the old name. Do NOT drop the view
-- here.

ALTER TABLE public.visits RENAME TO service_visits;

CREATE VIEW public.visits
  WITH (security_invoker = true)
  AS SELECT * FROM public.service_visits;

-- PostgREST needs role grants to expose the view at all; RLS on
-- service_visits still gates which rows each caller sees.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visits TO authenticated;
GRANT SELECT ON public.visits TO anon;

-- Reload the PostgREST schema cache so `visits` is queryable immediately.
NOTIFY pgrst, 'reload schema';
