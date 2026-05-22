ALTER TABLE public.visits RENAME TO service_visits;

CREATE VIEW public.visits
  WITH (security_invoker = true)
  AS SELECT * FROM public.service_visits;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visits TO authenticated;
GRANT SELECT ON public.visits TO anon;