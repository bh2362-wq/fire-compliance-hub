-- One-off data fix: normalise stored quote content to the new house rules.
-- Replaces "BS 5839-1:2025" with "BS 5839-1:2017" and "BHO Fire & Security Ltd"
-- with "BHO Fire Ltd" across the columns where they typically appear.
--
-- Idempotent — re-running has no effect because the source strings are
-- gone after the first pass. Safe to apply in production.

-- quotations: text columns
UPDATE public.quotations
SET
  title        = REPLACE(REPLACE(title,        'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  summary      = REPLACE(REPLACE(summary,      'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  introduction = REPLACE(REPLACE(introduction, 'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  scope_content = REPLACE(REPLACE(scope_content, 'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  notes        = REPLACE(REPLACE(notes,        'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd'),
  terms        = REPLACE(REPLACE(terms,        'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd')
WHERE
  title        ILIKE '%BS 5839-1:2025%' OR title        ILIKE '%BHO Fire & Security Ltd%'
  OR summary   ILIKE '%BS 5839-1:2025%' OR summary      ILIKE '%BHO Fire & Security Ltd%'
  OR introduction  ILIKE '%BS 5839-1:2025%' OR introduction  ILIKE '%BHO Fire & Security Ltd%'
  OR scope_content ILIKE '%BS 5839-1:2025%' OR scope_content ILIKE '%BHO Fire & Security Ltd%'
  OR notes     ILIKE '%BS 5839-1:2025%' OR notes        ILIKE '%BHO Fire & Security Ltd%'
  OR terms     ILIKE '%BS 5839-1:2025%' OR terms        ILIKE '%BHO Fire & Security Ltd%';

-- quotations.scope is a Json column storing string[] in the older flow.
-- Cast to text, replace, cast back. Safe because the column shape is array
-- of strings and the replacements don't introduce characters that would
-- break the JSON structure.
UPDATE public.quotations
SET scope = REPLACE(REPLACE(scope::text, 'BS 5839-1:2025', 'BS 5839-1:2017'), 'BHO Fire & Security Ltd', 'BHO Fire Ltd')::jsonb
WHERE scope::text ILIKE '%BS 5839-1:2025%' OR scope::text ILIKE '%BHO Fire & Security Ltd%';

-- quotation_line_items: only swap the standard reference and company name.
-- We intentionally do NOT shorten or restructure long descriptions here —
-- that's a separate clean-up (regenerate via the new defect flow per the
-- correction brief).
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
