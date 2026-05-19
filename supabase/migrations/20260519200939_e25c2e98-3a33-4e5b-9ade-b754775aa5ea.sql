
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
  v_inner text;
BEGIN
  FOR r IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    WHERE con.conname IN (
      'quotations_works_type_check',
      'quotations_job_category_check',
      'job_classifications_job_category_check'
    )
  LOOP
    -- Pull contents of ARRAY[...]
    v_inner := regexp_replace(r.def, '.*ARRAY\[([^\]]+)\].*', E'\\1');
    -- Find every quoted literal, ignoring ::text casts
    v_db_values := ARRAY(
      SELECT m[1]
      FROM regexp_matches(v_inner, '''([^'']+)''', 'g') AS m
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
