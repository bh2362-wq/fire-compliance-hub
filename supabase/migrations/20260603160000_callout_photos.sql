-- Callout report — §2 evidence photos
-- ─────────────────────────────────────────────────────────────────────
-- The existing callout flow (VisitCalloutPanel + calloutReportPdfGenerator)
-- captures fault details on service_visits.fault_details (JSONB) and
-- reuses service_reports for materials/signatures. The one piece that
-- was missing was a place to put evidence photos (panel display, faulty
-- device, etc.) so they can be embedded in §2 of the callout report.
--
-- This migration is additive only — no changes to service_visits or
-- service_reports. The new callout_photos table is keyed to the visit
-- (not a parallel callout_reports row) so it slots into the existing
-- flow without a wider schema split.

CREATE TABLE public.callout_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        uuid NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  storage_path    text NOT NULL,
  caption         text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_callout_photos_visit ON public.callout_photos(visit_id);

ALTER TABLE public.callout_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY callout_photos_all ON public.callout_photos FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));

-- Storage bucket for the photo bytes. Private (signed URLs only) so a
-- leaked URL can't be hot-linked. Matches the ce-outputs / quote-outputs
-- pattern.
INSERT INTO storage.buckets (id, name, public)
VALUES ('callout-photos', 'callout-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — elevated users only, same gate as everywhere else
-- in this app. Full quartet (select/insert/update/delete) so the wizard
-- can list, upload, rename a caption, and remove a frame.
CREATE POLICY "callout_photos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'callout-photos' AND has_elevated_role(auth.uid()));
CREATE POLICY "callout_photos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'callout-photos' AND has_elevated_role(auth.uid()));
CREATE POLICY "callout_photos_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'callout-photos' AND has_elevated_role(auth.uid()))
  WITH CHECK (bucket_id = 'callout-photos' AND has_elevated_role(auth.uid()));
CREATE POLICY "callout_photos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'callout-photos' AND has_elevated_role(auth.uid()));
