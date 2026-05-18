
-- Cleanup previously stuck ingests
UPDATE public.ref_lib_documents
SET ingest_status = 'failed',
    ingest_error = 'Killed by CPU time limit during PDF parsing (legacy issue, fixed in new architecture)'
WHERE ingest_status = 'processing'
  AND created_at < now() - interval '5 minutes';

-- Safety net: any authenticated user can reset rows stuck > 10 min
CREATE OR REPLACE FUNCTION public.reset_stuck_ref_lib_ingests()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  reset_count integer;
BEGIN
  UPDATE public.ref_lib_documents
  SET ingest_status = 'failed',
      ingest_error = COALESCE(NULLIF(ingest_error, ''), 'Ingest timed out or worker killed')
  WHERE ingest_status IN ('processing', 'pending')
    AND updated_at < now() - interval '10 minutes';
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_stuck_ref_lib_ingests() TO authenticated;
