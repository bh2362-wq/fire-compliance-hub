-- Null out orphan references before adding FKs
UPDATE public.smart_form_submissions s SET site_id = NULL
  WHERE site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites x WHERE x.id = s.site_id);
UPDATE public.smart_form_submissions s SET customer_id = NULL
  WHERE customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers x WHERE x.id = s.customer_id);
UPDATE public.smart_form_submissions s SET engineer_id = NULL
  WHERE engineer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.user_id = s.engineer_id);
UPDATE public.smart_form_submissions s SET visit_id = NULL
  WHERE visit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.visits x WHERE x.id = s.visit_id);

ALTER TABLE public.smart_form_submissions
  ADD CONSTRAINT smart_form_submissions_site_id_fkey
    FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL,
  ADD CONSTRAINT smart_form_submissions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD CONSTRAINT smart_form_submissions_engineer_id_fkey
    FOREIGN KEY (engineer_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT smart_form_submissions_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_smart_form_submissions_site_id     ON public.smart_form_submissions(site_id);
CREATE INDEX IF NOT EXISTS idx_smart_form_submissions_customer_id ON public.smart_form_submissions(customer_id);
CREATE INDEX IF NOT EXISTS idx_smart_form_submissions_engineer_id ON public.smart_form_submissions(engineer_id);
CREATE INDEX IF NOT EXISTS idx_smart_form_submissions_visit_id    ON public.smart_form_submissions(visit_id);