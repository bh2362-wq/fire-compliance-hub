
-- =====================================================
-- RAMS Activity Library - Pre-built hazard/method sets
-- =====================================================
CREATE TABLE public.rams_activity_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_key text NOT NULL UNIQUE,
  activity_name text NOT NULL,
  category text NOT NULL,
  british_standard text,
  description text,
  hazards jsonb NOT NULL DEFAULT '[]'::jsonb,
  method_statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe_requirements text[] NOT NULL DEFAULT '{}',
  emergency_procedures text,
  default_site_hazards text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rams_activity_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activity library"
  ON public.rams_activity_library FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Elevated users can manage activity library"
  ON public.rams_activity_library FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));

-- =====================================================
-- Customer RAMS Requirements
-- =====================================================
CREATE TABLE public.customer_rams_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  requirement_type text NOT NULL,
  title text NOT NULL,
  description text,
  is_mandatory boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_rams_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view customer rams requirements"
  ON public.customer_rams_requirements FOR SELECT TO authenticated
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage customer rams requirements"
  ON public.customer_rams_requirements FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));

-- =====================================================
-- Engineer RAMS Acknowledgements
-- =====================================================
CREATE TABLE public.rams_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rams_document_id uuid NOT NULL REFERENCES public.rams_documents(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  signature text,
  ip_address text,
  notes text,
  UNIQUE(rams_document_id, engineer_id)
);

ALTER TABLE public.rams_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view acknowledgements"
  ON public.rams_acknowledgements FOR SELECT TO authenticated
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Authenticated users can insert own acknowledgements"
  ON public.rams_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (engineer_id = auth.uid());

CREATE POLICY "Elevated users can manage acknowledgements"
  ON public.rams_acknowledgements FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));

-- =====================================================
-- Add activity_key to rams_documents for linking
-- =====================================================
ALTER TABLE public.rams_documents ADD COLUMN IF NOT EXISTS activity_key text;

-- =====================================================
-- Auto-generate RAMS trigger on visit creation
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_generate_rams_on_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Map visit_type to activity_key
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

  -- Check if RAMS already exists for this visit
  IF EXISTS (SELECT 1 FROM rams_documents WHERE visit_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Get activity library data
  SELECT * INTO v_activity FROM rams_activity_library
    WHERE activity_key = v_activity_key AND is_active = true
    LIMIT 1;

  IF v_activity IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get site info
  SELECT s.name, s.address, c.name as customer_name
  INTO v_site
  FROM sites s
  LEFT JOIN customers c ON c.id = s.customer_id
  WHERE s.id = NEW.site_id;

  -- Get customer requirements for this site
  SELECT jsonb_agg(jsonb_build_object('title', cr.title, 'description', cr.description))
  INTO v_customer_reqs
  FROM customer_rams_requirements cr
  JOIN sites s ON s.id = NEW.site_id
  WHERE cr.customer_id = s.customer_id
    AND (cr.site_id IS NULL OR cr.site_id = NEW.site_id)
    AND cr.is_mandatory = true;

  -- Build site-specific hazards text
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

  -- Get next RAMS number
  SELECT get_next_qms_number('RAMS') INTO v_rams_number;

  -- Build title
  v_title := v_activity.activity_name || ' - ' || COALESCE(v_site.name, 'Unknown Site');

  -- Create RAMS document
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
    'draft', 1, NEW.created_by
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_rams_on_visit_insert
  AFTER INSERT ON public.visits
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_rams_on_visit();

-- =====================================================
-- SEED DATA: Fire Alarm Service (BS 5839)
-- =====================================================
INSERT INTO public.rams_activity_library (activity_key, activity_name, category, british_standard, description, sort_order, hazards, method_statements, ppe_requirements, emergency_procedures, default_site_hazards) VALUES

('fire_alarm_service', 'Fire Alarm Service & Maintenance', 'Fire Detection', 'BS 5839-1', 'Quarterly/bi-annual servicing of fire alarm systems including panel checks, detector testing, sounder verification, and cause & effect testing.', 1,
'[
  {"id":"h1","hazard":"Working at Height","who_affected":"Engineers, Building Occupants","existing_controls":"Use of step ladders and mobile scaffolds in accordance with Work at Height Regulations 2005. Equipment inspected before use. Three points of contact maintained.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Ensure stable footing on all surfaces. Use tower scaffold for heights above 2m. Never overreach from ladders.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"All work carried out on low voltage circuits (24V DC). Isolation procedures followed. Lock-out/tag-out applied where required. PAT tested equipment used.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Verify circuits are de-energised before working. Use insulated tools. Never work on live mains circuits without permit.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h3","hazard":"Fire System Impairment","who_affected":"All Building Occupants","existing_controls":"Building management notified before system impairment. Fire watch arrangements in place. Impairment logged and minimised.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Maintain radio contact with site contact. Restore system ASAP after each zone test. Never leave system impaired overnight.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h4","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct lifting techniques used. Heavy items carried by two persons. Trolley used for heavy equipment.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Plan route before moving equipment. Assess load weight before lifting.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h5","hazard":"Noise","who_affected":"Engineers, Building Occupants","existing_controls":"Building occupants warned before sounder test. Tests kept to minimum duration. Ear protection available.","likelihood":3,"severity":2,"risk_level":"Medium","additional_controls":"Use ear defenders during extended sounder tests. Limit continuous sounder activation to 10 seconds.","residual_likelihood":2,"residual_severity":2,"residual_risk":"Low"},
  {"id":"h6","hazard":"Asbestos","who_affected":"Engineers","existing_controls":"Asbestos register reviewed before work. No penetration of surfaces without clearance. Report any suspected ACMs immediately.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Check asbestos register on arrival. Do not drill or disturb any suspected materials. Stop work and report if ACMs found.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h7","hazard":"Lone Working","who_affected":"Engineers","existing_controls":"Buddy system or check-in procedure in place. Engineer carries charged mobile phone. Office aware of site location and expected return.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Check in every 2 hours. Share live location where possible.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h8","hazard":"Slips, Trips and Falls","who_affected":"Engineers, Building Occupants","existing_controls":"Cables managed and routed safely. Work areas kept tidy. Appropriate footwear worn.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Use cable covers where trailing leads cross walkways. Clean up immediately after work.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, review asbestos register and site safety rules. Notify building management of planned works and system impairment schedule.","responsible_person":"Lead Engineer","equipment_required":"ID badge, sign-in credentials, RAMS document"},
  {"step_number":2,"description":"Conduct visual inspection of fire alarm panel. Check for faults, isolations, and system status. Record panel readings.","responsible_person":"Lead Engineer","equipment_required":"Test equipment, torch, notebook"},
  {"step_number":3,"description":"Zone-by-zone functional testing of detection devices. Use approved test equipment (smoke capsules, heat guns). Record device status.","responsible_person":"Engineer","equipment_required":"Solo detector tester, smoke capsules, heat test kit, access equipment"},
  {"step_number":4,"description":"Test manual call points using test keys. Verify correct zone indication at panel.","responsible_person":"Engineer","equipment_required":"MCP test keys, zone plan"},
  {"step_number":5,"description":"Sounder and visual alarm device testing. Verify audibility in all areas. Check beacon operation.","responsible_person":"Engineer","equipment_required":"Decibel meter (if required), ear defenders"},
  {"step_number":6,"description":"Check all ancillary equipment: door holders, fire curtain releases, damper controls, cause and effect interfaces.","responsible_person":"Lead Engineer","equipment_required":"Test equipment, interface documentation"},
  {"step_number":7,"description":"Check standby batteries and charger operation. Measure battery voltages under load where applicable.","responsible_person":"Engineer","equipment_required":"Multimeter, battery tester"},
  {"step_number":8,"description":"Restore system to normal operation. Clear all test conditions. Verify panel shows normal status with zero faults.","responsible_person":"Lead Engineer","equipment_required":"Panel access code"},
  {"step_number":9,"description":"Complete service report and log book entry. Discuss findings with site contact. Report any defects requiring remedial action.","responsible_person":"Lead Engineer","equipment_required":"Service report forms, defect report"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Ear Protection', 'Gloves', 'Dust Mask'],
'1. Stop all work immediately if fire alarm activates genuinely\n2. Evacuate via nearest fire exit to designated assembly point\n3. Do not use lifts\n4. Call 999 if real fire discovered\n5. Account for all team members at assembly point\n6. Do not re-enter building until authorised by fire service\n7. Report all incidents to office immediately\n8. If injury occurs, administer first aid and call emergency services\n9. Nearest A&E location to be identified on arrival',
'Check for:\n- Asbestos containing materials (review register)\n- Restricted access areas requiring permits\n- Active construction/renovation work\n- Shared tenancy fire strategy implications\n- Building-specific fire evacuation procedures'
),

('fire_alarm_inspection', 'Annual Fire Alarm Inspection', 'Fire Detection', 'BS 5839-1', 'Comprehensive annual inspection including all quarterly checks plus full system verification, battery load testing, and certificate issuance.', 2,
'[
  {"id":"h1","hazard":"Working at Height","who_affected":"Engineers, Building Occupants","existing_controls":"Use of step ladders and mobile scaffolds. Equipment inspected before use. Three points of contact.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Tower scaffold for heights above 2m. Never overreach.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"Low voltage circuits (24V DC). Isolation procedures followed. Insulated tools used.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Verify de-energised before work. Lock-out/tag-out on mains.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h3","hazard":"Fire System Impairment","who_affected":"All Building Occupants","existing_controls":"Building management notified. Fire watch in place. Impairment logged.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Radio contact with site contact. Restore system ASAP.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h4","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct lifting techniques. Two-person lift for heavy items.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Plan route. Assess weight before lifting.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h5","hazard":"Asbestos","who_affected":"Engineers","existing_controls":"Asbestos register reviewed. No drilling without clearance.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Check register on arrival. Stop work if ACMs suspected.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h6","hazard":"Lone Working","who_affected":"Engineers","existing_controls":"Check-in procedure. Charged mobile carried.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Check in every 2 hours.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, review asbestos register and site safety rules. Arrange fire watch with building management.","responsible_person":"Lead Engineer","equipment_required":"ID badge, RAMS document"},
  {"step_number":2,"description":"Full panel inspection: software version, configuration, event log review, fault history analysis.","responsible_person":"Lead Engineer","equipment_required":"Laptop, panel documentation"},
  {"step_number":3,"description":"100% device testing: every detector, MCP, sounder, and interface tested and recorded.","responsible_person":"All Engineers","equipment_required":"Full test kit, access equipment"},
  {"step_number":4,"description":"Battery load test: disconnect mains, monitor battery voltage under full load for minimum 30 minutes.","responsible_person":"Lead Engineer","equipment_required":"Multimeter, load test equipment"},
  {"step_number":5,"description":"Cable inspection: visual check of all accessible cabling for damage, correct support, and fire stopping.","responsible_person":"Engineer","equipment_required":"Torch, inspection mirror"},
  {"step_number":6,"description":"Full cause and effect verification against fire strategy document.","responsible_person":"Lead Engineer","equipment_required":"Fire strategy document, interface schedule"},
  {"step_number":7,"description":"Issue fire alarm certificate BS 5839-1. Complete comprehensive report with recommendations.","responsible_person":"Lead Engineer","equipment_required":"Certificate forms, report templates"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Ear Protection', 'Gloves', 'Dust Mask', 'Hard Hat'],
'1. Stop all work immediately if fire alarm activates genuinely\n2. Evacuate via nearest fire exit to designated assembly point\n3. Call 999 if real fire discovered\n4. Account for all team members at assembly point\n5. Do not re-enter building until authorised\n6. Report all incidents to office immediately',
'Check for:\n- Asbestos register\n- Restricted access areas\n- Active construction work\n- Fire strategy document availability\n- Building evacuation procedures'
),

('fire_alarm_emergency', 'Emergency Fire Alarm Callout', 'Fire Detection', 'BS 5839-1', 'Emergency response to fire alarm faults, false alarms, or system failures requiring immediate attendance.', 3,
'[
  {"id":"h1","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"Isolation procedures. Insulated tools. Live working avoided where possible.","likelihood":3,"severity":5,"risk_level":"Very High","additional_controls":"Extra caution on unfamiliar systems. Verify isolation before work.","residual_likelihood":2,"residual_severity":5,"residual_risk":"High"},
  {"id":"h2","hazard":"Working at Height","who_affected":"Engineers","existing_controls":"Ladders inspected. Three points of contact.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Assess before climbing. Use scaffold if extended work needed.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h3","hazard":"Fire System Impairment","who_affected":"All Occupants","existing_controls":"Site contact informed. Fire watch arranged.","likelihood":3,"severity":5,"risk_level":"Very High","additional_controls":"Prioritise system restoration. Maintain contact with site.","residual_likelihood":2,"residual_severity":5,"residual_risk":"High"},
  {"id":"h4","hazard":"Lone Working","who_affected":"Engineers","existing_controls":"Office aware of callout. Check-in procedure.","likelihood":3,"severity":3,"risk_level":"Medium","additional_controls":"Regular contact. Share location.","residual_likelihood":2,"residual_severity":3,"residual_risk":"Medium"},
  {"id":"h5","hazard":"Fatigue / Stress","who_affected":"Engineers","existing_controls":"Drive time limits observed. Breaks taken. Second engineer for complex faults.","likelihood":3,"severity":3,"risk_level":"Medium","additional_controls":"Do not attend if fatigued from driving. Request support if needed.","residual_likelihood":2,"residual_severity":3,"residual_risk":"Medium"}
]'::jsonb,
'[
  {"step_number":1,"description":"Receive callout details. Confirm site address, access arrangements, and nature of fault. Inform office of ETA.","responsible_person":"Engineer","equipment_required":"Phone, vehicle, basic tool kit"},
  {"step_number":2,"description":"Arrive on site, sign in, assess situation. Determine if building is safe to enter.","responsible_person":"Engineer","equipment_required":"ID badge, torch, PPE"},
  {"step_number":3,"description":"Diagnose fault at fire alarm panel. Review event log and fault history.","responsible_person":"Engineer","equipment_required":"Panel access codes, test equipment"},
  {"step_number":4,"description":"Carry out repair or temporary fix. Restore system to operational status.","responsible_person":"Engineer","equipment_required":"Spare parts, tools, replacement devices"},
  {"step_number":5,"description":"Test repaired circuit/zone. Verify panel shows normal. Log all actions.","responsible_person":"Engineer","equipment_required":"Test equipment"},
  {"step_number":6,"description":"Brief site contact on findings and any follow-up work required. Complete callout report.","responsible_person":"Engineer","equipment_required":"Report forms"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Gloves', 'Torch'],
'1. Stop work if genuine fire suspected\n2. Evacuate immediately\n3. Call 999\n4. Do not re-enter until authorised\n5. Report to office',
'Emergency callout - hazards may not be fully known in advance.\nConduct dynamic risk assessment on arrival.\nBe prepared to withdraw if conditions unsafe.'
),

('fire_alarm_remedial', 'Fire Alarm Remedial Works', 'Fire Detection', 'BS 5839-1', 'Planned remedial works including device replacement, cable repairs, panel modifications, and system upgrades.', 4,
'[
  {"id":"h1","hazard":"Working at Height","who_affected":"Engineers","existing_controls":"Scaffolding/MEWP for extended work at height. Ladders for short-duration access only.","likelihood":3,"severity":4,"risk_level":"High","additional_controls":"MEWP training verified. Harness used on all MEWP work.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"Isolation before cable work. Insulated tools. LOTO procedures.","likelihood":3,"severity":5,"risk_level":"Very High","additional_controls":"Permit to work for mains connections. Two-person rule for live testing.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h3","hazard":"Drilling / Cutting","who_affected":"Engineers, Occupants","existing_controls":"Asbestos check before drilling. Cable/pipe detector used. Dust extraction.","likelihood":3,"severity":4,"risk_level":"High","additional_controls":"CAT scanner before any penetration. RPE for dusty environments.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h4","hazard":"Fire System Impairment","who_affected":"All Occupants","existing_controls":"Planned impairment schedule. Fire watch. System restored at end of each day.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Minimise impairment windows. Temporary detection if prolonged.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h5","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct techniques. Two-person lift for cable drums and panels.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Trolley for heavy items. Plan cable routes.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h6","hazard":"Dust and Debris","who_affected":"Engineers, Occupants","existing_controls":"Dust sheets used. Vacuuming after work. Ventilation maintained.","likelihood":3,"severity":2,"risk_level":"Medium","additional_controls":"RPE in enclosed spaces. Seal openings to occupied areas.","residual_likelihood":2,"residual_severity":2,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, conduct toolbox talk. Review scope of works and site-specific hazards.","responsible_person":"Lead Engineer","equipment_required":"RAMS, toolbox talk form, PPE"},
  {"step_number":2,"description":"Set up work area. Install barriers/signage. Lay dust sheets. Arrange fire watch if required.","responsible_person":"All Engineers","equipment_required":"Barriers, signage, dust sheets"},
  {"step_number":3,"description":"Isolate affected circuits/zones at panel. Confirm isolation with site contact.","responsible_person":"Lead Engineer","equipment_required":"Panel access, LOTO equipment"},
  {"step_number":4,"description":"Carry out remedial works as per job scope. Cable installation, device replacement, panel modifications.","responsible_person":"All Engineers","equipment_required":"Full tool kit, materials, access equipment"},
  {"step_number":5,"description":"Test all new and modified circuits. Commission replacement devices. Verify correct operation.","responsible_person":"Lead Engineer","equipment_required":"Test equipment, commissioning forms"},
  {"step_number":6,"description":"Restore system to full operation. Update panel configuration and log book.","responsible_person":"Lead Engineer","equipment_required":"Panel access, log book"},
  {"step_number":7,"description":"Clean work area. Remove all waste. Complete documentation and handover to site contact.","responsible_person":"All Engineers","equipment_required":"Cleaning equipment, waste bags, documentation"}
]'::jsonb,
ARRAY['Safety Boots', 'Hard Hat', 'Hi-Vis Vest', 'Safety Glasses', 'Ear Protection', 'Dust Mask', 'Gloves', 'Knee Pads'],
'1. Stop all work if fire alarm activates genuinely\n2. Evacuate via nearest fire exit\n3. Call 999 if real fire\n4. Account for all team members\n5. Do not re-enter until authorised\n6. Report all incidents immediately',
'Check for:\n- Asbestos register (critical before any drilling)\n- Existing cable routes and containment\n- Services behind walls/ceilings (use CAT scanner)\n- Permit to work requirements\n- Hot works permit if soldering'
),

('emergency_lighting_service', 'Emergency Lighting Service', 'Emergency Lighting', 'BS 5266-1', 'Routine testing and maintenance of emergency lighting systems including monthly flick tests and annual duration tests.', 10,
'[
  {"id":"h1","hazard":"Working at Height","who_affected":"Engineers","existing_controls":"Step ladders and mobile towers. Equipment inspected before use.","likelihood":3,"severity":4,"risk_level":"High","additional_controls":"Tower scaffold for ceiling-mounted fittings. Never stand on furniture.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"Isolation before opening fittings. Insulated tools used.","likelihood":2,"severity":5,"risk_level":"High","additional_controls":"Test for dead before touching. Isolate at DB where possible.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h3","hazard":"Battery Hazards","who_affected":"Engineers","existing_controls":"NiCd/NiMH/Li batteries handled with care. Damaged batteries not touched. Correct disposal.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Wear gloves when handling batteries. Do not short-circuit. Bag damaged batteries separately.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h4","hazard":"Loss of Emergency Lighting","who_affected":"All Occupants","existing_controls":"Testing scheduled with building management. Alternative lighting arrangements.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Test during daylight hours where possible. Restore promptly.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h5","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct techniques. Two-person lift for large fittings.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Use platform for overhead work to reduce strain.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, notify building management of testing schedule. Review any access restrictions.","responsible_person":"Engineer","equipment_required":"ID badge, RAMS, test forms"},
  {"step_number":2,"description":"Visual inspection of all emergency lighting fittings. Check for damage, obscured diffusers, and correct positioning.","responsible_person":"Engineer","equipment_required":"Torch, inspection checklist"},
  {"step_number":3,"description":"Functional test: simulate mains failure at distribution board. Verify all fittings illuminate correctly.","responsible_person":"Engineer","equipment_required":"DB access, test equipment"},
  {"step_number":4,"description":"For annual test: maintain mains failure for full rated duration (1hr or 3hr). Monitor and record lamp operation.","responsible_person":"Engineer","equipment_required":"Timer, recording forms"},
  {"step_number":5,"description":"Replace failed lamps and batteries as required. Record all replacements.","responsible_person":"Engineer","equipment_required":"Replacement lamps, batteries, tools"},
  {"step_number":6,"description":"Restore mains supply. Verify charging indicators on central battery systems.","responsible_person":"Engineer","equipment_required":"Test equipment"},
  {"step_number":7,"description":"Complete test certificate BS 5266-1. Log results and recommendations.","responsible_person":"Engineer","equipment_required":"Certificate forms, logbook"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Gloves'],
'1. Stop work if fire alarm activates\n2. Evacuate via nearest exit\n3. Call 999 if emergency\n4. Report all incidents',
'Check for:\n- Areas requiring maintained emergency lighting\n- Central battery system locations\n- High-risk task areas with specific lux requirements'
),

('fire_extinguisher_service', 'Fire Extinguisher Service', 'Fire Suppression', 'BS 5306-3', 'Annual inspection, testing, and maintenance of portable fire extinguishers including visual checks, weight verification, and commissioning.', 20,
'[
  {"id":"h1","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct lifting techniques. Trolley for multiple extinguishers. Two-person lift for large CO2 units.","likelihood":3,"severity":3,"risk_level":"Medium","additional_controls":"CO2 extinguishers can weigh 20kg+. Always use trolley. Plan route.","residual_likelihood":2,"residual_severity":3,"residual_risk":"Medium"},
  {"id":"h2","hazard":"Pressure Vessel Hazards","who_affected":"Engineers","existing_controls":"Visual inspection for damage before handling. Condemned units not discharged. Correct discharge procedures.","likelihood":1,"severity":5,"risk_level":"Medium","additional_controls":"Never attempt to open a pressurised unit. Check for corrosion and damage.","residual_likelihood":1,"residual_severity":5,"residual_risk":"Medium"},
  {"id":"h3","hazard":"Chemical Exposure","who_affected":"Engineers","existing_controls":"Powder extinguishers handled carefully. Avoid inhaling discharge. Clean up spills.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"RPE when dealing with powder spillage. Wash hands after handling.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h4","hazard":"Slips, Trips and Falls","who_affected":"Engineers, Occupants","existing_controls":"Extinguishers returned to stands/brackets immediately. Work area kept tidy.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Do not leave extinguishers on floor in walkways.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h5","hazard":"CO2 Cold Burns","who_affected":"Engineers","existing_controls":"CO2 units handled with horn. Gloves worn during discharge testing.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Never touch horn during discharge. Use proper discharge equipment.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, locate all fire extinguisher positions using site plan.","responsible_person":"Engineer","equipment_required":"Site plan, inspection forms"},
  {"step_number":2,"description":"Visual inspection of each extinguisher: condition, signage, accessibility, tamper indicators, pressure gauge.","responsible_person":"Engineer","equipment_required":"Inspection checklist, torch"},
  {"step_number":3,"description":"Weigh CO2 extinguishers. Compare against manufacturer tolerances.","responsible_person":"Engineer","equipment_required":"Calibrated scales"},
  {"step_number":4,"description":"Check discharge mechanisms and safety pins. Replace damaged or missing items.","responsible_person":"Engineer","equipment_required":"Replacement pins, clips, signage"},
  {"step_number":5,"description":"Invert stored-pressure units to check powder mobility (powder type only).","responsible_person":"Engineer","equipment_required":"PPE, dust mask"},
  {"step_number":6,"description":"Replace any condemned or out-of-date extinguishers. Commissioning of new units.","responsible_person":"Engineer","equipment_required":"Replacement extinguishers, commissioning labels"},
  {"step_number":7,"description":"Apply service labels with next service date. Complete inspection certificate.","responsible_person":"Engineer","equipment_required":"Service labels, certificate forms"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Gloves', 'Dust Mask'],
'1. Stop work if fire alarm activates\n2. Evacuate immediately\n3. Call 999 if fire discovered\n4. Use extinguisher only if trained and safe to do so\n5. Report all incidents',
'Check for:\n- Total number and types of extinguishers\n- Access restrictions to extinguisher locations\n- Vehicle-mounted extinguishers\n- Kitchen wet chemical requirements'
),

('intruder_alarm_service', 'Intruder Alarm Service & Maintenance', 'Security Systems', 'BS EN 50131 / PD 6662', 'Routine maintenance of intruder alarm systems including detector testing, panel health checks, and communication path verification.', 30,
'[
  {"id":"h1","hazard":"Working at Height","who_affected":"Engineers","existing_controls":"Ladders/scaffolds for detector access. Equipment inspected.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Use MEWP for high-level external detectors.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"Low voltage systems. Isolation procedures.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Check mains supply isolation before panel work.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h3","hazard":"Security System Impairment","who_affected":"Client","existing_controls":"ARC/keyholders notified. Test signals sent. System restored same day.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Coordinate with monitoring centre. Verify signals restored.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h4","hazard":"Dog Hazards (External Detectors)","who_affected":"Engineers","existing_controls":"Site contact confirms animals secured before external work.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Do not enter premises with unsecured animals.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h5","hazard":"Lone Working","who_affected":"Engineers","existing_controls":"Check-in procedure. Mobile phone carried.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Regular contact with office.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, put system into engineer mode. Notify ARC of maintenance visit.","responsible_person":"Engineer","equipment_required":"Panel codes, ARC contact details"},
  {"step_number":2,"description":"Visual inspection of panel, detectors, contacts, and wiring. Check for tampering or damage.","responsible_person":"Engineer","equipment_required":"Torch, inspection checklist"},
  {"step_number":3,"description":"Walk test all PIR/dual-tech detectors. Verify detection patterns and coverage.","responsible_person":"Engineer","equipment_required":"Walk test mode, zone plan"},
  {"step_number":4,"description":"Test door/window contacts and shock sensors. Verify secure fixing.","responsible_person":"Engineer","equipment_required":"Test equipment, magnet"},
  {"step_number":5,"description":"Test bell/siren operation. Verify internal and external sounders.","responsible_person":"Engineer","equipment_required":"Ear defenders"},
  {"step_number":6,"description":"Test communication paths: PSTN, GSM/GPRS, IP. Verify signal receipt at ARC.","responsible_person":"Engineer","equipment_required":"ARC contact, test signal logs"},
  {"step_number":7,"description":"Check battery condition and standby duration. Measure voltages.","responsible_person":"Engineer","equipment_required":"Multimeter"},
  {"step_number":8,"description":"Exit engineer mode. Verify full system operational. Complete service report.","responsible_person":"Engineer","equipment_required":"Report forms, logbook"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Gloves'],
'1. Stop work if fire alarm activates\n2. Evacuate immediately\n3. Call 999 if emergency\n4. Report all incidents',
'Check for:\n- ARC monitoring details\n- Keyholder information\n- External detector access requirements\n- Pet-immune detector settings'
),

('cctv_service', 'CCTV System Service & Maintenance', 'Security Systems', 'BS EN 62676', 'Maintenance of CCTV systems including camera cleaning, recording verification, image quality checks, and NVR/DVR health monitoring.', 31,
'[
  {"id":"h1","hazard":"Working at Height","who_affected":"Engineers","existing_controls":"MEWP or scaffold for external cameras. Ladders for internal only.","likelihood":3,"severity":4,"risk_level":"High","additional_controls":"Harness on MEWP. Weather check for external work.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"PoE systems low risk. Mains-powered cameras isolated before work.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Check power source before accessing cameras.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h3","hazard":"Data Protection / GDPR","who_affected":"Client, Public","existing_controls":"No personal data accessed or copied. Images not stored on personal devices.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Do not photograph screens showing CCTV footage. Follow client data policy.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h4","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct techniques for NVR/DVR units.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Two-person lift for rack-mounted equipment.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h5","hazard":"Adverse Weather (External)","who_affected":"Engineers","existing_controls":"Postpone external camera work in high winds, lightning, or heavy rain.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Check forecast before attending. Dynamic risk assessment on arrival.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, access NVR/DVR. Check system health, storage capacity, and recording status.","responsible_person":"Engineer","equipment_required":"Login credentials, laptop"},
  {"step_number":2,"description":"Review camera image quality on each channel. Check for degradation, IR failure, or misalignment.","responsible_person":"Engineer","equipment_required":"Monitor/laptop, test chart"},
  {"step_number":3,"description":"Clean camera lenses and housings. Tighten mounts. Check cable connections.","responsible_person":"Engineer","equipment_required":"Cleaning kit, tools, access equipment"},
  {"step_number":4,"description":"Check PoE switch port status and network health. Verify IP addressing.","responsible_person":"Engineer","equipment_required":"Laptop, network tools"},
  {"step_number":5,"description":"Test remote access functionality. Verify client app connectivity.","responsible_person":"Engineer","equipment_required":"Remote access credentials"},
  {"step_number":6,"description":"Check UPS/battery backup for recording equipment. Test failover.","responsible_person":"Engineer","equipment_required":"Multimeter"},
  {"step_number":7,"description":"Complete service report with screenshots of any issues. Handover to site contact.","responsible_person":"Engineer","equipment_required":"Report forms, screenshots"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Gloves', 'Hard Hat'],
'1. Stop work if fire alarm activates\n2. Evacuate immediately\n3. Report all incidents',
'Check for:\n- Recording retention period requirements\n- Remote access configuration\n- External camera access requirements\n- GDPR signage compliance'
),

('access_control_service', 'Access Control Service & Maintenance', 'Security Systems', 'BS EN 60839', 'Maintenance of access control systems including door hardware, readers, controllers, and software verification.', 32,
'[
  {"id":"h1","hazard":"Electrical Hazards","who_affected":"Engineers","existing_controls":"Lock power supplies isolated before hardware work. Insulated tools.","likelihood":2,"severity":4,"risk_level":"Medium","additional_controls":"Verify isolation. Check for backup power.","residual_likelihood":1,"residual_severity":4,"residual_risk":"Low"},
  {"id":"h2","hazard":"Door/Lock Mechanisms","who_affected":"Engineers, Occupants","existing_controls":"Doors secured open during work. Warning signs displayed.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Never leave fire doors propped open. Test fail-safe/fail-secure operation.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h3","hazard":"Building Security Impairment","who_affected":"Client, Occupants","existing_controls":"Site contact aware of security impairment. Alternative security arrangements.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Minimise door-open time. Restore access control ASAP.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h4","hazard":"Manual Handling","who_affected":"Engineers","existing_controls":"Correct techniques for door furniture and controllers.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Support doors during hardware changes.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"},
  {"id":"h5","hazard":"Pinch/Trap Hazards","who_affected":"Engineers","existing_controls":"Care with door closers and magnetic locks. Fingers kept clear of pinch points.","likelihood":2,"severity":3,"risk_level":"Medium","additional_controls":"Test door operation from safe position.","residual_likelihood":1,"residual_severity":3,"residual_risk":"Low"}
]'::jsonb,
'[
  {"step_number":1,"description":"Arrive on site, sign in, access control software. Review system health and event logs.","responsible_person":"Engineer","equipment_required":"Login credentials, laptop"},
  {"step_number":2,"description":"Test each reader: card/fob presentation, biometric (if fitted), intercom integration.","responsible_person":"Engineer","equipment_required":"Test cards, registration forms"},
  {"step_number":3,"description":"Check door hardware: maglocks, strikes, closers, request-to-exit buttons. Verify correct operation.","responsible_person":"Engineer","equipment_required":"Test equipment, tools"},
  {"step_number":4,"description":"Test fire alarm interface: verify doors release on fire alarm activation (fail-safe).","responsible_person":"Engineer","equipment_required":"Fire alarm access, coordination with site"},
  {"step_number":5,"description":"Check controller battery backups and power supplies. Measure voltages.","responsible_person":"Engineer","equipment_required":"Multimeter"},
  {"step_number":6,"description":"Verify time schedules and access levels are correct. Update as requested.","responsible_person":"Engineer","equipment_required":"Software access"},
  {"step_number":7,"description":"Complete service report. Handover to site contact with recommendations.","responsible_person":"Engineer","equipment_required":"Report forms"}
]'::jsonb,
ARRAY['Safety Boots', 'Hi-Vis Vest', 'Safety Glasses', 'Gloves'],
'1. Stop work if fire alarm activates\n2. Evacuate immediately\n3. Report all incidents',
'Check for:\n- Fire alarm integration requirements\n- Fail-safe vs fail-secure door configurations\n- Building security protocols during maintenance\n- Intercom/video entry integration'
);
