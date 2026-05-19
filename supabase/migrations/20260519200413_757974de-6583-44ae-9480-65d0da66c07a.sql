
ALTER TABLE public.quotations DROP CONSTRAINT quotations_works_type_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_works_type_check
  CHECK (works_type IN (
    'new_install','system_upgrade','system_takeover','extension',
    'reactive_remedial','planned_maintenance','design_only',
    'commissioning','cause_and_effect','acceptance_testing',
    'verification','certification'
  ));

ALTER TABLE public.quotations DROP CONSTRAINT quotations_job_category_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_job_category_check
  CHECK (job_category IN (
    'new_install','system_upgrade','system_takeover','extension',
    'reactive_remedial','planned_maintenance','design_only',
    'commissioning','cause_and_effect','acceptance_testing',
    'verification','certification'
  ));
