-- Rename visit_type 'emergency' → 'callout'
-- ─────────────────────────────────────────────────────────────────────
-- Engineers + customers refer to these visits as "callouts", not
-- "emergencies". This migration updates every existing row from
-- 'emergency' to 'callout' and rebuilds the CHECK constraint to
-- match.
--
-- Deploy-lag safety: the new constraint keeps 'emergency' as an
-- allowed-but-deprecated value alongside 'callout'. Any frontend
-- pod still on the old code that tries to write 'emergency' during
-- the rollout window won't get rejected. A follow-up migration can
-- drop 'emergency' from the allowed list once we're confident the
-- old code has rolled out everywhere.
--
-- Drift fix: this also adds 'room_integrity' and 'gas_suppression'
-- to the allowed list. Both have been in src/constants/visitTypes.ts
-- since at least early 2026 but were never added to the CHECK
-- constraint — silent rejection waiting to fire. Cheaper to fix
-- the gap in the same migration that's already rebuilding the
-- constraint.

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_visit_type_check;

-- Update existing rows. service_visits, where it exists, is the
-- same table physically (visits has been the canonical name; the
-- newer migrations reference service_visits in policies but the
-- rows live in `visits`).
UPDATE public.visits
  SET visit_type = 'callout'
  WHERE visit_type = 'emergency';

-- New constraint — adds 'callout' + fixes the room_integrity /
-- gas_suppression drift. 'emergency' stays for deploy-lag safety.
ALTER TABLE public.visits
  ADD CONSTRAINT visits_visit_type_check
  CHECK (visit_type IN (
    'callout',
    'emergency',          -- deprecated; drop in a follow-up migration
    'quarterly_service',
    'biannual_service',
    'annual_inspection',
    'remedial',
    'supply_only',
    'subcontract',
    'room_integrity',
    'gas_suppression'
  ));
