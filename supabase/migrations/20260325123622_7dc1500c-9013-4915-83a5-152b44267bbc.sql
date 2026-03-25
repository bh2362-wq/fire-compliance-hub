CREATE OR REPLACE FUNCTION public.auto_generate_rams_on_visit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_activity_key text;
  v_activity record;
  v_site record;
  v_customer_reqs jsonb;
  v_rams_number text;
  v_title text;
  v_site_hazards text;
  v_site_access text;
BEGIN
  v_activity_key := CASE NEW.visit_type
    WHEN 'quarterly_service' THEN 'fire_alarm_service'
    WHEN 'biannual_service' THEN 'fire_alarm_service'
    WHEN 'annual_inspection' THEN 'fire_alarm_inspection'
    WHEN 'emergency' THEN 'fire_alarm_emergency'
    WHEN 'remedial' THEN 'fire_alarm_remedial'
    ELSE NULL
  END;

  IF v_activity_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM rams_documents WHERE visit_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_activity FROM rams_activity_library
    WHERE activity_key = v_activity_key AND is_active = true
    LIMIT 1;

  IF v_activity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.name, s.address, c.name as customer_name
  INTO v_site
  FROM sites s
  LEFT JOIN customers c ON c.id = s.customer_id
  WHERE s.id = NEW.site_id;

  SELECT jsonb_agg(jsonb_build_object('title', cr.title, 'description', cr.description))
  INTO v_customer_reqs
  FROM customer_rams_requirements cr
  JOIN sites s ON s.id = NEW.site_id
  WHERE cr.customer_id = s.customer_id
    AND (cr.site_id IS NULL OR cr.site_id = NEW.site_id)
    AND cr.is_mandatory = true;

  v_site_hazards := COALESCE(v_activity.default_site_hazards, '');
  IF v_customer_reqs IS NOT NULL THEN
    v_site_hazards := v_site_hazards || E'\n\nCustomer Requirements:\n';
    FOR v_activity_key IN SELECT jsonb_array_elements_text(
      (SELECT jsonb_agg(r->>'title' || ': ' || COALESCE(r->>'description', ''))
       FROM jsonb_array_elements(v_customer_reqs) r)
    ) LOOP
      v_site_hazards := v_site_hazards || '- ' || v_activity_key || E'\n';
    END LOOP;
  END IF;

  SELECT get_next_qms_number('RAMS') INTO v_rams_number;

  v_title := v_activity.activity_name || ' - ' || COALESCE(v_site.name, 'Unknown Site');

  INSERT INTO rams_documents (
    rams_number, title, site_id, visit_id, activity_key,
    hazards, method_statements, ppe_requirements,
    emergency_procedures, site_specific_hazards,
    status, version, created_by
  ) VALUES (
    v_rams_number, v_title, NEW.site_id, NEW.id, v_activity_key,
    v_activity.hazards, v_activity.method_statements, v_activity.ppe_requirements,
    v_activity.emergency_procedures,
    v_site_hazards,
    'draft', 1, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );

  RETURN NEW;
END;
$function$