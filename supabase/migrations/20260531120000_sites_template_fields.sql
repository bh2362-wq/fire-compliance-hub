-- Sites schema augmentation — feeds the template prefill story.
--
-- A subset of the columns from the original "Sites Schema Augmentation"
-- brief was added piecemeal by Lovable earlier (panel_make_model,
-- bs5839_category, year_installed, num_zones, num_loops, num_devices,
-- arc_connected, cable_type, psu_capacity_ah, panel_software_version,
-- areas_covered, areas_not_covered, building_type, occupancy_type) so
-- this migration only adds the remaining fields.
--
-- Naming choices to avoid clashes with what's already on the table:
--   - `panel_make_model` already exists, so `panel_make` and
--     `panel_model` from the brief are NOT split out — composePanelMakeModel
--     in siteSystemInfoService already handles the in-UI split.
--   - `building_type` already exists, so `site_type` from the brief is
--     not duplicated.
--   - `occupancy_type` already exists, so `occupancy_class` is not added.
--
-- Per the brief: CHECK constraints rather than ENUM, every new column
-- nullable / has a sensible default so existing rows still load.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS num_manual_call_points int      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_sounders           int      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_detectors          int      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arc_provider           text,
  ADD COLUMN IF NOT EXISTS arc_account_ref        text,
  ADD COLUMN IF NOT EXISTS access_hours           text,
  ADD COLUMN IF NOT EXISTS duty_holder_name       text,
  ADD COLUMN IF NOT EXISTS duty_holder_role       text,
  ADD COLUMN IF NOT EXISTS duty_holder_email      text,
  ADD COLUMN IF NOT EXISTS duty_holder_phone      text;

-- PAVA (voice alarm) block — gated by has_pava in the UI so it doesn't
-- clutter non-PAVA sites. Compliance flags are nullable on purpose
-- (engineer can leave "unknown" until verified).
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS has_pava                  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pava_make                 text,
  ADD COLUMN IF NOT EXISTS pava_model                text,
  ADD COLUMN IF NOT EXISTS pava_software_version     text,
  ADD COLUMN IF NOT EXISTS pava_bs_en_54_16_compliant boolean,
  ADD COLUMN IF NOT EXISTS pava_bs_en_54_24_compliant boolean,
  ADD COLUMN IF NOT EXISTS pava_num_zones            int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pava_num_loudspeakers     int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pava_num_circuits         int     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pava_fa_interface_method  text,
  ADD COLUMN IF NOT EXISTS pava_network_topology     text,
  ADD COLUMN IF NOT EXISTS pava_has_backup_amplifier boolean DEFAULT false;

-- Indexes for common filtered queries (only the rows with values are in
-- each index thanks to the partial WHERE).
CREATE INDEX IF NOT EXISTS idx_sites_arc       ON public.sites(arc_connected)   WHERE arc_connected = true;
CREATE INDEX IF NOT EXISTS idx_sites_has_pava  ON public.sites(has_pava)        WHERE has_pava = true;
CREATE INDEX IF NOT EXISTS idx_sites_category  ON public.sites(bs5839_category) WHERE bs5839_category IS NOT NULL;
