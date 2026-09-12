ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS serial_no text,
  ADD COLUMN IF NOT EXISTS reference_by text;

CREATE INDEX IF NOT EXISTS leads_assigned_to_status_idx ON public.leads (assigned_to, status);