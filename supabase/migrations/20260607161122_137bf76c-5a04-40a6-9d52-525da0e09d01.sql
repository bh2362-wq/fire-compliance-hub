
CREATE OR REPLACE FUNCTION public.approve_qms_document(p_document_id uuid, p_comments text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_version_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'Only the Director (owner) can approve documents';
  END IF;

  SELECT id INTO v_version_id
  FROM public.qms_document_versions
  WHERE document_id = p_document_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version_id IS NULL THEN
    INSERT INTO public.qms_document_versions (document_id, version_number, created_by)
    VALUES (p_document_id, 1, v_uid)
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.qms_document_approvals (document_version_id, approver_id, status, comments, approved_at)
  VALUES (v_version_id, v_uid, 'approved', p_comments, now());

  UPDATE public.qms_documents
  SET status = 'approved', updated_at = now()
  WHERE id = p_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_qms_document(p_document_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_version_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'Only the Director (owner) can unlock documents';
  END IF;

  SELECT id INTO v_version_id
  FROM public.qms_document_versions
  WHERE document_id = p_document_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version_id IS NOT NULL THEN
    UPDATE public.qms_document_approvals
    SET status = 'rejected', comments = COALESCE(p_reason, comments), updated_at = now()
    WHERE document_version_id = v_version_id AND status = 'approved';
  END IF;

  UPDATE public.qms_documents
  SET status = 'draft', updated_at = now()
  WHERE id = p_document_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_qms_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_qms_document(uuid, text) TO authenticated;
