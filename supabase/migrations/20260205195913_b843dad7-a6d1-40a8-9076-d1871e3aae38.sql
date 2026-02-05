-- Create sequence for PO numbering starting at 322
CREATE SEQUENCE public.purchase_order_number_seq START WITH 322;

-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  xero_contact_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase orders table
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  delivery_address TEXT,
  reference TEXT,
  notes TEXT,
  subtotal NUMERIC(10,2) DEFAULT 0,
  vat_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 20,
  xero_purchase_order_id TEXT UNIQUE,
  xero_status TEXT,
  synced_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase order line items table
CREATE TABLE public.purchase_order_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  account_code TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for suppliers
CREATE POLICY "Elevated users can view suppliers" ON public.suppliers
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert suppliers" ON public.suppliers
  FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update suppliers" ON public.suppliers
  FOR UPDATE USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete suppliers" ON public.suppliers
  FOR DELETE USING (has_elevated_role(auth.uid()));

-- RLS policies for purchase orders
CREATE POLICY "Elevated users can view purchase orders" ON public.purchase_orders
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert purchase orders" ON public.purchase_orders
  FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update purchase orders" ON public.purchase_orders
  FOR UPDATE USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete purchase orders" ON public.purchase_orders
  FOR DELETE USING (has_elevated_role(auth.uid()));

-- RLS policies for line items
CREATE POLICY "Elevated users can view po line items" ON public.purchase_order_line_items
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert po line items" ON public.purchase_order_line_items
  FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update po line items" ON public.purchase_order_line_items
  FOR UPDATE USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete po line items" ON public.purchase_order_line_items
  FOR DELETE USING (has_elevated_role(auth.uid()));

-- Function to get next PO number
CREATE OR REPLACE FUNCTION public.get_next_po_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT nextval('public.purchase_order_number_seq') INTO next_num;
  RETURN 'PO-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_po_line_items_updated_at
  BEFORE UPDATE ON public.purchase_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();