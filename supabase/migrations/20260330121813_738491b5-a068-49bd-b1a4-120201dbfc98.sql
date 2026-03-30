
ALTER TABLE public.visits DROP CONSTRAINT visits_engineer_id_fkey;
ALTER TABLE public.visits ADD CONSTRAINT visits_engineer_id_fkey FOREIGN KEY (engineer_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
