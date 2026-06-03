-- Bring ce_audibility_reports up to service_reports parity for the
-- columns the Reports-page row dropdown writes to.
--
-- Until now, ce_audibility_reports lacked invoiced / sharepoint_url /
-- sharepoint_folder, so Mark as Invoiced, Upload to SharePoint, and
-- Open in SharePoint had no place to store their results. Add them
-- with safe defaults so existing rows pick up the same behaviour as
-- service_reports without backfill.

ALTER TABLE public.ce_audibility_reports
  ADD COLUMN IF NOT EXISTS invoiced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sharepoint_url text,
  ADD COLUMN IF NOT EXISTS sharepoint_folder text;
