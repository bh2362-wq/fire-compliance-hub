-- BAFE SP203-1 — cert number generator
-- ─────────────────────────────────────────────────────────────────────
-- PR #3 of the BAFE foundation series. Provides the sequential
-- certificate number that goes onto every BAFE-issued cert.
--
-- Format: BHO-{PREFIX}-{YYYY}-{NNNNN}
--   PREFIX  - COC (compliance) / MOD (modular) / MNT (maintenance) /
--             MOF (modification)
--   YYYY    - calendar year of issuance (the sequence resets each Jan)
--   NNNNN   - zero-padded sequence, per (cert_type, year)
--
-- Implementation choice: Postgres function via RPC, not an edge
-- function. The spec called for an edge function but the existing
-- project pattern is Postgres functions for sequential numbers
-- (get_next_quotation_number, get_next_report_number). Postgres has
-- three concrete advantages here:
--   1. Atomic — INSERT ON CONFLICT DO UPDATE RETURNING gives us a
--      race-free increment without table-wide locking.
--   2. No HTTP roundtrip from client → edge → DB → edge → client.
--   3. Same TS-side surface (one async call) so the caller doesn't
--      care which side of the wire generated the number.
-- The TS wrapper in src/utils/bafe/generateCertNumber.ts gives
-- consumers the same one-function ergonomics the edge function
-- would have.

-- Per-(cert_type, year) counter table. UPSERT against this is the
-- atomic primitive that backs the sequence. One row per type per
-- year — small forever.
CREATE TABLE IF NOT EXISTS public.bafe_cert_number_sequences (
  cert_type text NOT NULL
    CHECK (cert_type IN ('compliance','modular','maintenance','modification')),
  cert_year int NOT NULL CHECK (cert_year >= 2025),
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (cert_type, cert_year)
);

ALTER TABLE public.bafe_cert_number_sequences ENABLE ROW LEVEL SECURITY;

-- Direct table access is locked down — the only legitimate writer
-- is the function below (SECURITY DEFINER), which bypasses RLS.
-- Read access for elevated users so the dashboard can display
-- "next number will be NNNNN" if it wants to.
CREATE POLICY bafe_cert_number_sequences_read
  ON public.bafe_cert_number_sequences FOR SELECT TO authenticated
  USING (has_elevated_role(auth.uid()));

-- The generator. INSERT ON CONFLICT DO UPDATE returns the new seq
-- atomically — two concurrent calls cannot get the same number.
CREATE OR REPLACE FUNCTION public.get_next_bafe_cert_number(p_cert_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   int := EXTRACT(YEAR FROM now())::int;
  v_seq    int;
  v_prefix text;
BEGIN
  IF p_cert_type NOT IN ('compliance','modular','maintenance','modification') THEN
    RAISE EXCEPTION 'Invalid cert_type %, must be one of compliance/modular/maintenance/modification', p_cert_type;
  END IF;

  v_prefix := CASE p_cert_type
    WHEN 'compliance'   THEN 'COC'
    WHEN 'modular'      THEN 'MOD'
    WHEN 'maintenance'  THEN 'MNT'
    WHEN 'modification' THEN 'MOF'
  END;

  -- Atomic increment. The ON CONFLICT clause references the row
  -- being inserted via EXCLUDED, but we want the existing row's
  -- last_seq to drive the new value — so the SET reads the table
  -- alias, not EXCLUDED. RETURNING last_seq gives us the value
  -- AFTER the update, which is the seq we just assigned.
  INSERT INTO public.bafe_cert_number_sequences (cert_type, cert_year, last_seq)
  VALUES (p_cert_type, v_year, 1)
  ON CONFLICT (cert_type, cert_year) DO UPDATE
    SET last_seq = public.bafe_cert_number_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN format(
    'BHO-%s-%s-%s',
    v_prefix,
    v_year::text,
    lpad(v_seq::text, 5, '0')
  );
END;
$$;

-- Only authenticated users can call it. The function itself doesn't
-- check has_elevated_role — the front-end calls are gated at the
-- cert-issuance UI, and consuming the next number is harmless on
-- its own (just bumps a counter). If you need stricter access,
-- wrap the EXECUTE GRANT in a custom role.
GRANT EXECUTE ON FUNCTION public.get_next_bafe_cert_number(text) TO authenticated;

COMMENT ON FUNCTION public.get_next_bafe_cert_number(text) IS
  'Returns the next BAFE SP203-1 certificate number for the given '
  'type. Format: BHO-{COC|MOD|MNT|MOF}-{YYYY}-{NNNNN}. Sequence is '
  'atomic and resets per calendar year per cert_type.';
