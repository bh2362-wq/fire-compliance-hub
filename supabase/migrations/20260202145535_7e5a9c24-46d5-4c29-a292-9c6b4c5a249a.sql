-- Add foreign key from appointments.engineer_id to profiles.user_id
ALTER TABLE public.appointments
ADD CONSTRAINT appointments_engineer_id_fkey
FOREIGN KEY (engineer_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;