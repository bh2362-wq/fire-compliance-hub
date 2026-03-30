
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS microsoft_email text;

-- Table to track Outlook sync state per appointment
CREATE TABLE IF NOT EXISTS public.outlook_calendar_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE NOT NULL,
  engineer_id text NOT NULL,
  outlook_event_id text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_direction text NOT NULL DEFAULT 'push',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, engineer_id)
);

ALTER TABLE public.outlook_calendar_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage outlook sync"
  ON public.outlook_calendar_sync
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
