-- Lead classification (Temperature + Grade) becomes part of the CRM core.
-- Additive only: existing columns, policies and the post-call report flow stay intact.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS classification_note text,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS classified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_state text NOT NULL DEFAULT 'pending';

ALTER TABLE public.leads
  ADD CONSTRAINT leads_temperature_check
    CHECK (temperature IS NULL OR temperature IN ('hot','warm','cold')),
  ADD CONSTRAINT leads_grade_check
    CHECK (grade IS NULL OR grade IN ('A','B','C','D')),
  ADD CONSTRAINT leads_work_state_check
    CHECK (work_state IN ('pending','completed'));

CREATE INDEX IF NOT EXISTS leads_work_state_idx ON public.leads (work_state);
CREATE INDEX IF NOT EXISTS leads_temperature_idx ON public.leads (temperature);

ALTER TABLE public.call_reports
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS grade text;

ALTER TABLE public.call_reports
  ADD CONSTRAINT call_reports_temperature_check
    CHECK (temperature IS NULL OR temperature IN ('hot','warm','cold')),
  ADD CONSTRAINT call_reports_grade_check
    CHECK (grade IS NULL OR grade IN ('A','B','C','D'));

-- Classification history: every saved decision, with who decided it.
CREATE TABLE IF NOT EXISTS public.lead_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.call_reports(id) ON DELETE SET NULL,
  temperature text NOT NULL,
  grade text NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'manual',
  classified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_classifications_temperature_check CHECK (temperature IN ('hot','warm','cold')),
  CONSTRAINT lead_classifications_grade_check CHECK (grade IN ('A','B','C','D')),
  CONSTRAINT lead_classifications_source_check CHECK (source IN ('manual','coordinator','authority'))
);

CREATE INDEX IF NOT EXISTS lead_classifications_lead_idx
  ON public.lead_classifications (lead_id, classified_at DESC);
CREATE INDEX IF NOT EXISTS lead_classifications_agent_idx
  ON public.lead_classifications (agent_id, classified_at DESC);

GRANT SELECT ON public.lead_classifications TO authenticated;
GRANT ALL ON public.lead_classifications TO service_role;

ALTER TABLE public.lead_classifications ENABLE ROW LEVEL SECURITY;

-- Read-only for signed-in staff: own decisions for agents, whole floor for
-- admin/team_leader. All writes go through the server (service_role).
CREATE POLICY "Staff read classifications in scope"
ON public.lead_classifications
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR agent_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- A received call may not be submitted without Temperature + Grade.
CREATE OR REPLACE FUNCTION public.validate_call_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'submitted' THEN
    IF NEW.category IS NULL OR NEW.category NOT IN (
      'hot_lead','follow_up','interested','not_interested','callback','no_answer','wrong_number','closed_converted'
    ) THEN
      RAISE EXCEPTION 'invalid or missing call report category';
    END IF;
    IF coalesce(btrim(NEW.summary), '') = '' THEN
      RAISE EXCEPTION 'call summary is required';
    END IF;
    IF coalesce(btrim(NEW.note), '') = '' THEN
      RAISE EXCEPTION 'call note is required';
    END IF;
    IF NEW.follow_up_at IS NULL THEN
      RAISE EXCEPTION 'follow-up date and time are required';
    END IF;
    IF NEW.category IN ('not_interested','wrong_number') AND coalesce(btrim(NEW.reason), '') = '' THEN
      RAISE EXCEPTION 'this category requires a reason';
    END IF;
    IF NEW.connected THEN
      IF NEW.temperature IS NULL OR NEW.temperature NOT IN ('hot','warm','cold') THEN
        RAISE EXCEPTION 'a received call requires a temperature classification';
      END IF;
      IF NEW.grade IS NULL OR NEW.grade NOT IN ('A','B','C','D') THEN
        RAISE EXCEPTION 'a received call requires a grade classification';
      END IF;
    END IF;
    IF NEW.submitted_at IS NULL THEN NEW.submitted_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$function$;