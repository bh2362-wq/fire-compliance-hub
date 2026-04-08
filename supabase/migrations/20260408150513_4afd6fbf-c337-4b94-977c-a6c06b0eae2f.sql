-- Update appointments whose linked visit is completed or invoiced
UPDATE appointments 
SET status = 'completed', updated_at = now()
WHERE visit_id IS NOT NULL 
AND status IN ('scheduled', 'in_progress')
AND visit_id IN (
  SELECT id FROM visits WHERE status IN ('completed', 'invoiced')
);