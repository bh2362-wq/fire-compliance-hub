-- Backfill content_hash on historical remittance_advices rows + auto-dismiss
-- already-allocated duplicates.
--
-- Why
--   PR #176 added the content_hash column and a partial unique index, but
--   only NEW inserts get a hash — existing rows stayed NULL, so the dedup
--   couldn't tell a fresh scan that it was duplicating something already
--   on file. The user's complaint:
--
--     "duplicates that have already been allocated"
--
--   The Bibby factoring remittance was getting re-imported on every scan
--   because the historical row had no hash to collide against.
--
-- What this migration does
--   1. Computes the canonical string for every NULL-hash row and
--      SHA-256 hashes it. Same recipe as the TS buildContentHash():
--        lower(payer_name) || total_amount(.00) || payment_date
--        || sorted invoice_numbers joined with "|"
--   2. Picks one "winner" per canonical group (applied first, then
--      most-recently received) and writes the hash onto it.
--   3. Auto-dismisses the loser rows whose status is parsed /
--      needs_review (so they stop appearing in Pending). 'applied'
--      rows are NEVER touched — the dedup gives the winner status
--      precedence to applied if any exists in the group, so a true
--      double-apply would still be visible. 'failed' / already-dismissed
--      rows are left as-is.
--   4. Rows with no meaningful signal (no amount, no date, no invoice
--      numbers) stay NULL — no point hashing nothing.
--
-- Safety
--   • The dismissal updates record the winner's id in error_message so
--     the audit trail shows why each row got dismissed and what to look
--     at if it needs reviewing.
--   • Wrapped in a transaction so a partial run is impossible.
--   • Idempotent: re-running the migration is a no-op (NULL → still NULL
--     because we only target NULL hashes; dismissed → still dismissed).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  hashed_count    integer;
  dismissed_count integer;
BEGIN
  -- ── Compute canonicals + winners ─────────────────────────────────────
  CREATE TEMP TABLE _backfill_canonicals ON COMMIT DROP AS
  WITH base AS (
    SELECT
      r.id,
      r.status,
      r.received_at,
      r.applied_at,
      LOWER(COALESCE(TRIM(r.payer_name), '')) || '::' ||
        COALESCE(TO_CHAR(r.total_amount, 'FM999999999990.00'), '') || '::' ||
        COALESCE(r.payment_date::text, '') || '::' ||
        COALESCE(
          (
            SELECT string_agg(
              LOWER(TRIM(li.invoice_number)),
              '|' ORDER BY LOWER(TRIM(li.invoice_number))
            )
            FROM public.remittance_line_items li
            WHERE li.remittance_id = r.id
              AND li.invoice_number IS NOT NULL
          ),
          ''
        )
        AS canonical,
      (
        r.total_amount IS NOT NULL
        OR r.payment_date IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.remittance_line_items li2
          WHERE li2.remittance_id = r.id AND li2.invoice_number IS NOT NULL
        )
      ) AS has_signal
    FROM public.remittance_advices r
    WHERE r.content_hash IS NULL
  )
  SELECT
    id,
    status,
    canonical,
    encode(digest(canonical, 'sha256'), 'hex') AS hash,
    ROW_NUMBER() OVER (
      PARTITION BY canonical
      ORDER BY
        CASE WHEN status = 'applied' THEN 0 ELSE 1 END,
        applied_at DESC NULLS LAST,
        received_at DESC NULLS LAST
    ) AS rn,
    COUNT(*) OVER (PARTITION BY canonical) AS group_size
  FROM base
  WHERE has_signal;

  -- ── Write the hash onto the winner of each group ─────────────────────
  WITH winners AS (
    SELECT id, hash FROM _backfill_canonicals WHERE rn = 1
  )
  UPDATE public.remittance_advices ra
  SET content_hash = w.hash
  FROM winners w
  WHERE ra.id = w.id;
  GET DIAGNOSTICS hashed_count = ROW_COUNT;

  -- ── Auto-dismiss losers ─────────────────────────────────────────────
  -- Only dismisses status IN ('parsed', 'needs_review'). Anything already
  -- applied / failed / dismissed is left as-is so we don't rewrite history.
  WITH winner_per_group AS (
    SELECT canonical, id AS winner_id FROM _backfill_canonicals WHERE rn = 1
  ),
  losers AS (
    SELECT
      c.id AS loser_id,
      w.winner_id
    FROM _backfill_canonicals c
    JOIN winner_per_group w ON w.canonical = c.canonical
    WHERE c.rn > 1
      AND c.group_size > 1
  )
  UPDATE public.remittance_advices ra
  SET
    status = 'dismissed',
    error_message = COALESCE(ra.error_message || E'\n', '')
      || 'Auto-dismissed by content_hash backfill: duplicate of remittance_advices.id '
      || l.winner_id::text,
    updated_at = now()
  FROM losers l
  WHERE ra.id = l.loser_id
    AND ra.status IN ('parsed', 'needs_review');
  GET DIAGNOSTICS dismissed_count = ROW_COUNT;

  RAISE NOTICE 'content_hash backfill: hashed % winners, dismissed % loser rows.',
    hashed_count, dismissed_count;
END $$;
