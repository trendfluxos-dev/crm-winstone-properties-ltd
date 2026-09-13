-- Day-by-day lead work. A lead now carries the working day it belongs to, so an
-- agent can pull any older lead into today's (or a chosen day's) work without the
-- lead ever leaving their dashboard.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS work_date date;

UPDATE public.leads
SET work_date = (created_at AT TIME ZONE 'Asia/Dhaka')::date
WHERE work_date IS NULL;

CREATE INDEX IF NOT EXISTS leads_work_date_owner_idx
  ON public.leads (work_date, assigned_to);

-- Yearly retention: the IT council records where each year's full export was
-- stored before an account is refreshed. Immutable history, admin-only.
CREATE TABLE IF NOT EXISTS public.lead_year_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_year integer NOT NULL,
  lead_count integer NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  storage_location text NOT NULL,
  note text,
  archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (archive_year)
);

GRANT SELECT ON public.lead_year_archives TO authenticated;
GRANT ALL ON public.lead_year_archives TO service_role;

ALTER TABLE public.lead_year_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coordinators read year archives"
  ON public.lead_year_archives
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));
