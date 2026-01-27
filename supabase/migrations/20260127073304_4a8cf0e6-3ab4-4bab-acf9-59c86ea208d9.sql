-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'engineer', 'client', 'auditor');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create sites table
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postcode TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  total_devices INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create devices table (master inventory)
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  loop TEXT NOT NULL,
  address TEXT NOT NULL,
  device_type TEXT NOT NULL,
  location TEXT,
  zone TEXT,
  installed_at TIMESTAMPTZ,
  last_tested_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'faulty', 'replaced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, loop, address)
);

-- Create visits table
CREATE TABLE public.visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  engineer_id UUID REFERENCES auth.users(id),
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_type TEXT NOT NULL CHECK (visit_type IN ('quarterly_service', 'annual_inspection', 'emergency', 'remedial')),
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('scheduled', 'in_progress', 'pending_review', 'completed')),
  devices_tested INTEGER DEFAULT 0,
  total_devices INTEGER DEFAULT 0,
  coverage_percentage DECIMAL(5,2) DEFAULT 0,
  issues_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create file_uploads table
CREATE TABLE public.file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  storage_path TEXT,
  parsed_at TIMESTAMPTZ,
  devices_found INTEGER DEFAULT 0,
  devices_passed INTEGER DEFAULT 0,
  devices_failed INTEGER DEFAULT 0,
  parsing_errors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create parsed_device_tests table (results from file parsing)
CREATE TABLE public.parsed_device_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES public.file_uploads(id) ON DELETE CASCADE NOT NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id),
  loop TEXT NOT NULL,
  address TEXT NOT NULL,
  device_type TEXT,
  location TEXT,
  status TEXT NOT NULL CHECK (status IN ('passed', 'fault', 'untested', 'unknown')),
  raw_data JSONB,
  matched BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create issues table
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('fault', 'missing', 'unmatched', 'other')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parsed_device_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user has elevated role (owner, admin, engineer)
CREATE OR REPLACE FUNCTION public.has_elevated_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'admin', 'engineer')
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for user_roles (only admins can manage)
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for sites (elevated users can access)
CREATE POLICY "Elevated users can view sites" ON public.sites FOR SELECT TO authenticated USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert sites" ON public.sites FOR INSERT TO authenticated WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update sites" ON public.sites FOR UPDATE TO authenticated USING (public.has_elevated_role(auth.uid()));

-- RLS Policies for devices
CREATE POLICY "Elevated users can view devices" ON public.devices FOR SELECT TO authenticated USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update devices" ON public.devices FOR UPDATE TO authenticated USING (public.has_elevated_role(auth.uid()));

-- RLS Policies for visits
CREATE POLICY "Elevated users can view visits" ON public.visits FOR SELECT TO authenticated USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert visits" ON public.visits FOR INSERT TO authenticated WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update visits" ON public.visits FOR UPDATE TO authenticated USING (public.has_elevated_role(auth.uid()));

-- RLS Policies for file_uploads
CREATE POLICY "Elevated users can view uploads" ON public.file_uploads FOR SELECT TO authenticated USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert uploads" ON public.file_uploads FOR INSERT TO authenticated WITH CHECK (public.has_elevated_role(auth.uid()));

-- RLS Policies for parsed_device_tests
CREATE POLICY "Elevated users can view parsed tests" ON public.parsed_device_tests FOR SELECT TO authenticated USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert parsed tests" ON public.parsed_device_tests FOR INSERT TO authenticated WITH CHECK (public.has_elevated_role(auth.uid()));

-- RLS Policies for issues
CREATE POLICY "Elevated users can view issues" ON public.issues FOR SELECT TO authenticated USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert issues" ON public.issues FOR INSERT TO authenticated WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update issues" ON public.issues FOR UPDATE TO authenticated USING (public.has_elevated_role(auth.uid()));