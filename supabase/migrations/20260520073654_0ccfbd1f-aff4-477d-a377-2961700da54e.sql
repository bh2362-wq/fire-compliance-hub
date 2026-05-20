UPDATE public.quotations
SET
  title        = REPLACE(REPLACE(title,        'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  summary      = REPLACE(REPLACE(summary,      'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  introduction = REPLACE(REPLACE(introduction, 'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  notes        = REPLACE(REPLACE(notes,        'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  terms        = REPLACE(REPLACE(terms,        'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd')
WHERE
  title        ILIKE '%BS 5839-1:2025%' OR title        ILIKE '%BHO Fire & Security Ltd%'
  OR summary   ILIKE '%BS 5839-1:2025%' OR summary      ILIKE '%BHO Fire & Security Ltd%'
  OR introduction  ILIKE '%BS 5839-1:2025%' OR introduction  ILIKE '%BHO Fire & Security Ltd%'
  OR notes     ILIKE '%BS 5839-1:2025%' OR notes        ILIKE '%BHO Fire & Security Ltd%'
  OR terms     ILIKE '%BS 5839-1:2025%' OR terms        ILIKE '%BHO Fire & Security Ltd%';

UPDATE public.quotations
SET scope = REPLACE(REPLACE(scope::text, 'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd')::jsonb
WHERE scope::text ILIKE '%BS 5839-1:2025%' OR scope::text ILIKE '%BHO Fire & Security Ltd%';

UPDATE public.quotation_line_items
SET
  description          = REPLACE(REPLACE(description,          'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  regulation_reference = REPLACE(regulation_reference,         'BS 5839-1:2025', 'BS 5839-1:2017'),
  notes                = REPLACE(REPLACE(notes,                'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  title                = REPLACE(title,                        'BS 5839-1:2025', 'BS 5839-1:2017')
WHERE
  description ILIKE '%BS 5839-1:2025%' OR description ILIKE '%BHO Fire & Security Ltd%'
  OR regulation_reference ILIKE '%BS 5839-1:2025%'
  OR notes ILIKE '%BS 5839-1:2025%' OR notes ILIKE '%BHO Fire & Security Ltd%'
  OR title ILIKE '%BS 5839-1:2025%';