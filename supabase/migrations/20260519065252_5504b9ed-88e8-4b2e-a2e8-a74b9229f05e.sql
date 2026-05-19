ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS raw_import_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS imported_source_columns TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_devices_raw_import_data
ON public.devices USING GIN (raw_import_data);