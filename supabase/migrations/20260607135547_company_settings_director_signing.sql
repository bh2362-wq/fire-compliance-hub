-- Director signing details on company_settings.
--
-- Why
--   QMS document PDFs (qmsDocumentPdfGenerator.ts) render an
--   AUTHORISATION block with four blank lines: Signed / Name /
--   Position / Date. Auditors want the director's name + role +
--   signature pre-filled and consistent across EVERY document.
--   The user spotted the health-and-safety policy diverging from
--   the rest — the underlying cause was nothing populating the
--   block at all.
--
--   Adding the director details to company_settings keeps the
--   single source of truth alongside the company logo / footer
--   text / bank details that the same table already holds.
--
-- Columns
--   director_name           text  — e.g. "Ben Holden"
--   director_role           text  — e.g. "Managing Director"
--   director_signature_url  text  — base64 data URL or storage URL;
--                                   matches default_engineer_signature
--                                   shape so the same upload widget
--                                   works.
--
-- All nullable so existing rows / new tenants don't break; the PDF
-- generator falls back to blank lines when any field is missing
-- (preserves the previous behaviour for documents created before
-- signing details were filled in).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS director_name           text,
  ADD COLUMN IF NOT EXISTS director_role           text,
  ADD COLUMN IF NOT EXISTS director_signature_url  text;

COMMENT ON COLUMN public.company_settings.director_name IS
  'Director name pre-filled into the AUTHORISATION block on every QMS document PDF.';
COMMENT ON COLUMN public.company_settings.director_role IS
  'Director role (e.g. Managing Director) printed alongside the name on QMS documents.';
COMMENT ON COLUMN public.company_settings.director_signature_url IS
  'Director signature image — base64 data URL or storage URL. Embedded into the AUTHORISATION block.';
