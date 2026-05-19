
-- 1. Realign quotations.works_type and job_category to use commissioning_only
ALTER TABLE public.quotations DROP CONSTRAINT quotations_works_type_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_works_type_check
  CHECK (works_type IN (
    'new_install','system_upgrade','system_takeover','extension',
    'reactive_remedial','planned_maintenance','design_only',
    'commissioning_only','cause_and_effect','acceptance_testing',
    'verification','certification'
  ));

ALTER TABLE public.quotations DROP CONSTRAINT quotations_job_category_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_job_category_check
  CHECK (job_category IN (
    'new_install','system_upgrade','system_takeover','extension',
    'reactive_remedial','planned_maintenance','design_only',
    'commissioning_only','cause_and_effect','acceptance_testing',
    'verification','certification'
  ));

-- 2. Extend cost_intelligence.job_classifications to include the two missing categories
ALTER TABLE cost_intelligence.job_classifications DROP CONSTRAINT job_classifications_job_category_check;
ALTER TABLE cost_intelligence.job_classifications ADD CONSTRAINT job_classifications_job_category_check
  CHECK (job_category IN (
    'new_install','system_upgrade','system_takeover','extension',
    'reactive_remedial','planned_maintenance','design_only',
    'commissioning_only','cause_and_effect','acceptance_testing',
    'verification','certification'
  ));

-- 3. Regression guard: alignment check function
CREATE OR REPLACE FUNCTION public.check_works_type_alignment(
  p_typescript_values text[]
) RETURNS TABLE (
  constraint_name text,
  status text,
  missing_in_db text[],
  missing_in_typescript text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_db_values text[];
  v_def text;
BEGIN
  FOR r IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname IN (
      'quotations_works_type_check',
      'quotations_job_category_check',
      'job_classifications_job_category_check'
    )
  LOOP
    v_def := r.def;
    v_db_values := ARRAY(
      SELECT btrim(value, ' '''::text)
      FROM regexp_split_to_table(
        regexp_replace(v_def, '.*ARRAY\[([^\]]+)\].*', E'\\1'),
        ','
      ) AS value
    );

    constraint_name := r.conname;
    missing_in_db := ARRAY(SELECT unnest(p_typescript_values) EXCEPT SELECT unnest(v_db_values));
    missing_in_typescript := ARRAY(SELECT unnest(v_db_values) EXCEPT SELECT unnest(p_typescript_values));
    status := CASE
      WHEN array_length(missing_in_db, 1) IS NULL AND array_length(missing_in_typescript, 1) IS NULL
      THEN 'aligned' ELSE 'MISMATCH'
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;
