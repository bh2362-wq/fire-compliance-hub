
-- Function to auto-create NCR from service report defects
CREATE OR REPLACE FUNCTION public.auto_create_ncr_from_defects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ncr_num TEXT;
  site_name TEXT;
  customer_id UUID;
BEGIN
  -- Only trigger when defects_found is non-empty and wasn't before (or on insert)
  IF (NEW.defects_found IS NOT NULL AND TRIM(NEW.defects_found) != '') 
     AND (TG_OP = 'INSERT' OR OLD.defects_found IS NULL OR TRIM(COALESCE(OLD.defects_found, '')) = '') THEN
    
    -- Get the next NCR number
    SELECT get_next_qms_number('NCR') INTO ncr_num;
    
    -- Get customer_id from the site
    SELECT s.customer_id INTO customer_id FROM sites s WHERE s.id = NEW.site_id;
    
    -- Get site name for title
    SELECT s.name INTO site_name FROM sites s WHERE s.id = NEW.site_id;
    
    -- Create the NCR
    INSERT INTO qms_ncrs (
      ncr_number, title, description, source, severity, status,
      site_id, visit_id, customer_id, raised_by, immediate_action
    ) VALUES (
      ncr_num,
      'Defects found at ' || COALESCE(site_name, 'Unknown Site') || ' - ' || COALESCE(NEW.report_number, 'No Report#'),
      NEW.defects_found,
      'service_report',
      CASE 
        WHEN NEW.system_condition = 'critical' THEN 'critical'
        WHEN NEW.system_condition = 'poor' THEN 'major'
        ELSE 'minor'
      END,
      'open',
      NEW.site_id,
      NEW.visit_id,
      customer_id,
      NEW.created_by,
      NEW.recommendations
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on service_reports
CREATE TRIGGER auto_ncr_on_defects
  AFTER INSERT OR UPDATE OF defects_found ON public.service_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_ncr_from_defects();
