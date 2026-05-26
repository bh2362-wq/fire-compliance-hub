-- Augment sites with BS 5839-1 system-information columns + PAVA columns.
--
-- IMPORTANT: This file is committed for review/audit but is NOT auto-applied
-- by Lovable's pipeline (per the orphan-migration cleanup in commit 41628398).
-- Apply manually via Supabase dashboard SQL editor OR `supabase db push`.
--
-- 14 of the columns from the original brief already existed in the live DB
-- (probed 2026-05-26): panel_software_version, panel_make_model,
-- bs5839_category, year_installed, num_zones, num_loops, num_devices,
-- cable_type, psu_capacity_ah, arc_connected, areas_covered,
-- areas_not_covered, building_type (= brief's "site_type"),
-- occupancy_type (= brief's "occupancy_class"). They are omitted here to
-- keep the migration idempotent.
--
-- Decisions made resolving brief-vs-live clashes:
--   - panel_make/panel_model split rejected — keep panel_make_model combined
--   - site_type rejected — keep existing free-text building_type
--   - occupancy_class rejected — keep existing free-text occupancy_type

-- Net-new system-info columns on sites
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS num_manual_call_points int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_sounders           int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_detectors          int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arc_provider           text,
  ADD COLUMN IF NOT EXISTS arc_account_ref        text,
  ADD COLUMN IF NOT EXISTS access_hours           text,
  ADD COLUMN IF NOT EXISTS duty_holder_name       text,
  ADD COLUMN IF NOT EXISTS duty_holder_role       text,
  ADD COLUMN IF NOT EXISTS duty_holder_email      text,
  ADD COLUMN IF NOT EXISTS duty_holder_phone      text;

-- PAVA columns (all net-new; gated behind has_pava in UI so they don't
-- clutter the form for sites without voice alarm)
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS has_pava                       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pava_make                      text,
  ADD COLUMN IF NOT EXISTS pava_model                     text,
  ADD COLUMN IF NOT EXISTS pava_software_version          text,
  ADD COLUMN IF NOT EXISTS pava_bs_en_54_16_compliant     boolean,
  ADD COLUMN IF NOT EXISTS pava_bs_en_54_24_compliant     boolean,
  ADD COLUMN IF NOT EXISTS pava_num_zones                 int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pava_num_loudspeakers          int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pava_num_circuits              int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pava_fa_interface_method       text,
  ADD COLUMN IF NOT EXISTS pava_network_topology          text,
  ADD COLUMN IF NOT EXISTS pava_has_backup_amplifier      boolean DEFAULT false;

-- Indexes for common filters
CREATE INDEX IF NOT EXISTS idx_sites_category ON public.sites(bs5839_category)
  WHERE bs5839_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sites_arc      ON public.sites(arc_connected)
  WHERE arc_connected = true;
CREATE INDEX IF NOT EXISTS idx_sites_has_pava ON public.sites(has_pava)
  WHERE has_pava = true;
