
-- Device price lists: represents an uploaded device health report for pricing
CREATE TABLE public.device_price_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  site_id UUID REFERENCES public.sites(id),
  source_file_name TEXT,
  source_file_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total_items INTEGER DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  total_sell NUMERIC DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.device_price_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view device price lists" ON public.device_price_lists FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert device price lists" ON public.device_price_lists FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update device price lists" ON public.device_price_lists FOR UPDATE USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can delete device price lists" ON public.device_price_lists FOR DELETE USING (has_elevated_role(auth.uid()));

-- Device price items: individual devices with cost/markup/sell pricing
CREATE TABLE public.device_price_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  price_list_id UUID NOT NULL REFERENCES public.device_price_lists(id) ON DELETE CASCADE,
  model_number TEXT,
  description TEXT NOT NULL,
  device_type TEXT,
  location TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  cost_price NUMERIC DEFAULT 0,
  markup_percent NUMERIC DEFAULT 30,
  sell_price NUMERIC DEFAULT 0,
  labour_cost NUMERIC DEFAULT 0,
  ai_search_status TEXT DEFAULT 'pending',
  ai_price_results JSONB DEFAULT '[]'::jsonb,
  merged_from UUID[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.device_price_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view device price items" ON public.device_price_items FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert device price items" ON public.device_price_items FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update device price items" ON public.device_price_items FOR UPDATE USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can delete device price items" ON public.device_price_items FOR DELETE USING (has_elevated_role(auth.uid()));

-- Add cost_price and markup_percent to quotation_line_items
ALTER TABLE public.quotation_line_items 
  ADD COLUMN cost_price NUMERIC DEFAULT 0,
  ADD COLUMN markup_percent NUMERIC DEFAULT 0;

-- Update trigger for device_price_lists
CREATE TRIGGER update_device_price_lists_updated_at
  BEFORE UPDATE ON public.device_price_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_device_price_items_updated_at
  BEFORE UPDATE ON public.device_price_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
