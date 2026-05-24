CREATE TABLE public.cause_effect_matrices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  title           text NOT NULL,
  legend          text,
  source_file_path text,
  source_file_name text,
  uploaded_by     uuid REFERENCES auth.users(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  notes           text,
  is_archived     boolean NOT NULL DEFAULT false
);

CREATE TABLE public.cause_effect_outputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id       uuid NOT NULL REFERENCES public.cause_effect_matrices(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  code            text NOT NULL,
  panel_location  text,
  identification  text
);

CREATE TABLE public.cause_effect_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id         uuid NOT NULL REFERENCES public.cause_effect_matrices(id) ON DELETE CASCADE,
  ordinal           int  NOT NULL,
  ref               text,
  trigger_device    text,
  trigger_type      text,
  trigger_location  text,
  notes             text,
  actions           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_ce_matrices_site ON public.cause_effect_matrices(site_id) WHERE NOT is_archived;
CREATE INDEX idx_ce_outputs_matrix ON public.cause_effect_outputs(matrix_id);
CREATE INDEX idx_ce_rules_matrix   ON public.cause_effect_rules(matrix_id);

ALTER TABLE public.cause_effect_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_effect_outputs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cause_effect_rules    ENABLE ROW LEVEL SECURITY;

CREATE POLICY ce_matrices_all ON public.cause_effect_matrices FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_outputs_all  ON public.cause_effect_outputs  FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_rules_all    ON public.cause_effect_rules    FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cause-effect-matrices',
  'cause-effect-matrices',
  false,
  26214400,
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel']
);

CREATE POLICY ce_storage_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'cause-effect-matrices' AND has_elevated_role(auth.uid()))
  WITH CHECK (bucket_id = 'cause-effect-matrices' AND has_elevated_role(auth.uid()));