ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS system_type text CHECK (system_type IN ('gent_vigilon','gent_squad','gent_compact','conventional','aspirating','addressable_other','hybrid','voice_alarm','wireless')),
  ADD COLUMN IF NOT EXISTS building_type text CHECK (building_type IN ('hotel','serviced_apartments','school_primary','school_secondary','further_education','higher_education','healthcare_acute','healthcare_care_home','office_commercial','retail','industrial_warehouse','residential_hmo','residential_block','gov_central','gov_local_authority','mod_defence','fcdo_diplomatic','data_centre','leisure_hospitality','transport','other')),
  ADD COLUMN IF NOT EXISTS job_category text CHECK (job_category IN ('new_install','system_upgrade','system_takeover','extension','reactive_remedial','planned_maintenance','design_only','commissioning_only','cause_and_effect','certification')),
  ADD COLUMN IF NOT EXISTS region text CHECK (region IN ('london_central','london_outer','south_east','south_west','east_england','midlands','north','wales','scotland','northern_ireland','overseas')),
  ADD COLUMN IF NOT EXISTS bs5839_category text CHECK (bs5839_category IN ('L1','L2','L3','L4','L5','M','P1','P2','combined')),
  ADD COLUMN IF NOT EXISTS device_count integer,
  ADD COLUMN IF NOT EXISTS loop_count integer,
  ADD COLUMN IF NOT EXISTS gia_sqm numeric(10,2);