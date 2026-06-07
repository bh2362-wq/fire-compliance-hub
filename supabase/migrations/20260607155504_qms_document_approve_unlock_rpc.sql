-- QMS document approval: director-only approve + unlock RPCs.
--
-- Why
--   ISO 9001 Clause 7.5 (Documented information) requires that
--   controlled documents are reviewed and approved for suitability
--   before issue. In BHO Fire's QMS the Managing Director is the
--   approval authority. The qms_documents.status column already has
--   the right enum ('draft', 'pending_approval', 'approved',
--   'obsolete') and qms_document_approvals already stores the audit
--   trail per version — what was missing was an enforced, single-step
--   transition that's restricted to the 'owner' role.
--
--   Client-only gating is fragile (anyone with table write access via
--   RLS could PATCH status='approved' direct). These two RPCs run
--   SECURITY DEFINER, check the caller has 'owner' role, write the
--   approval audit row tied to the latest version, and flip the
--   document status atomically.
--
-- Surfaces
--   approve_qms_document(document_id, comments?) →
--     - asserts auth.uid() has role='owner'
--     - inserts qms_document_approvals(latest version, approver=auth.uid(),
--       status='approved', approved_at=now())
--     - sets qms_documents.status='approved'
--   unlock_qms_document(document_id) →
--     - asserts auth.uid() has role='owner'
--     - sets qms_documents.status='draft'
--     - inserts an audit row (status='rejected' with "Unlocked for
--       revision" comment) so the trail captures the revert
--
-- Errors raised via RAISE EXCEPTION with ERRCODE 42501 (insufficient
-- privilege) so the client can surface "only the director can approve"
-- cleanly.


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

  -- Tie the approval to the latest version so the audit trail tracks
  -- which file the director actually signed off on.
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
