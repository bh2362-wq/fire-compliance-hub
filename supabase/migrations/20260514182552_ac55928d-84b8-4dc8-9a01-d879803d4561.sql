-- Asset Maintenance + Customer Portal
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE
    DEFAULT encode(gen_random_bytes(32), 'hex');

UPDATE public.sites
  SET portal_token = encode(gen_random_bytes(32), 'hex')
  WHERE portal_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_sites_portal_token ON public.sites(portal_token);

CREATE POLICY "Anon portal read site by token"
  ON public.sites FOR SELECT TO anon
  USING (portal_token IS NOT NULL);

CREATE POLICY "Anon portal read smart form certs"
  ON public.smart_form_submissions FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.portal_token IS NOT NULL));

CREATE POLICY "Anon portal read visits"
  ON public.visits FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.portal_token IS NOT NULL));

CREATE POLICY "Anon portal read defects"
  ON public.site_defects FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.portal_token IS NOT NULL));

CREATE POLICY "Anon portal read site assets"
  ON public.site_assets FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.portal_token IS NOT NULL));