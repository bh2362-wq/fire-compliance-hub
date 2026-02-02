-- Create appointments table for scheduling diary
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  engineer_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  visit_type TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Elevated users can view appointments" 
ON public.appointments 
FOR SELECT 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert appointments" 
ON public.appointments 
FOR INSERT 
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update appointments" 
ON public.appointments 
FOR UPDATE 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete appointments" 
ON public.appointments 
FOR DELETE 
USING (has_elevated_role(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX idx_appointments_engineer ON public.appointments(engineer_id);
CREATE INDEX idx_appointments_site ON public.appointments(site_id);
CREATE INDEX idx_appointments_visit ON public.appointments(visit_id);