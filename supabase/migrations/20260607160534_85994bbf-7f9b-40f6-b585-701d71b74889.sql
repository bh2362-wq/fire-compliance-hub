-- Re-ship of 20260607155504_qms_document_approve_unlock_rpc.sql under
-- a UUID-suffixed filename. The original committed file didn't get
-- applied to the live database (PGRST202 "Could not find the function
-- public.approve_qms_document"). Same pattern as the earlier
-- cron_state miss — the auto-runner only picks up files that follow
-- its own <timestamp>_<uuid>.sql convention. CREATE OR REPLACE makes
-- this idempotent if the original ever does get applied.

CREATE OR REPLACE FUNCTION public.approve_qms_document(
  p_document_id uuid,
  p_comments    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_version_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the director (owner role) can approve QMS documents'
      USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_version_id
  FROM public.qms_document_versions
  WHERE document_id = p_document_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version_id IS NOT NULL THEN
    INSERT INTO public.qms_document_approvals (
      document_version_id, approver_id, status, comments, approved_at
    )
    VALUES (
      v_version_id, v_user_id, 'approved', p_comments, now()
    );
  END IF;

  UPDATE public.qms_documents
  SET status = 'approved'
  WHERE id = p_document_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.unlock_qms_document(
  p_document_id uuid,
  p_reason      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_version_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the director (owner role) can unlock QMS documents'
      USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_version_id
  FROM public.qms_document_versions
  WHERE document_id = p_document_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version_id IS NOT NULL THEN
    INSERT INTO public.qms_document_approvals (
      document_version_id, approver_id, status, comments, approved_at
    )
    VALUES (
      v_version_id,
      v_user_id,
      'rejected',
      COALESCE(NULLIF(p_reason, ''), 'Unlocked for revision'),
      now()
    );
  END IF;

  UPDATE public.qms_documents
  SET status = 'draft'
  WHERE id = p_document_id;
END;
$$;


GRANT EXECUTE ON FUNCTION public.approve_qms_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_qms_document(uuid, text) TO authenticated;

-- Force a NOTIFY pgrst so PostgREST reloads its schema cache and the
-- new function becomes callable immediately rather than after the
-- next idle reload.
NOTIFY pgrst, 'reload schema';
