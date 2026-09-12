-- 1. Per-device authentication for the Android agent app
CREATE TABLE IF NOT EXISTS public.agent_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_label text,
  platform text NOT NULL DEFAULT 'android',
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_devices_profile_idx ON public.agent_devices(profile_id);
GRANT SELECT ON public.agent_devices TO authenticated;
GRANT ALL ON public.agent_devices TO service_role;
ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own devices or admin read" ON public.agent_devices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = agent_devices.profile_id AND p.user_id = auth.uid())
  );

-- 2. Recording integrity / durable analysis state
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS client_upload_id text;
CREATE UNIQUE INDEX IF NOT EXISTS call_recordings_client_upload_id_key
  ON public.call_recordings(client_upload_id) WHERE client_upload_id IS NOT NULL;
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS analysis_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS analysis_error text;
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS recorder_source text;
ALTER TABLE public.call_recordings ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.agent_devices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS call_recordings_analysis_status_idx ON public.call_recordings(analysis_status);

-- 3. Mandatory post-call report
CREATE TABLE IF NOT EXISTS public.call_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recording_id uuid REFERENCES public.call_recordings(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.agent_devices(id) ON DELETE SET NULL,
  phone_number text,
  call_started_at timestamptz,
  call_ended_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  connected boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  category text,
  note text,
  reason text,
  follow_up_at timestamptz,
  ai_suggestion jsonb,
  ai_decision text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_reports_agent_status_idx ON public.call_reports(agent_id, status);
CREATE INDEX IF NOT EXISTS call_reports_lead_idx ON public.call_reports(lead_id);
GRANT SELECT, INSERT, UPDATE ON public.call_reports TO authenticated;
GRANT ALL ON public.call_reports TO service_role;
ALTER TABLE public.call_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own reports or supervisors read all" ON public.call_reports
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader') OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = call_reports.agent_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Agents update own reports" ON public.call_reports
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = call_reports.agent_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = call_reports.agent_id AND p.user_id = auth.uid()));

-- validation trigger: category + conditional required fields at submit time
CREATE OR REPLACE FUNCTION public.validate_call_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'submitted' THEN
    IF NEW.category IS NULL OR NEW.category NOT IN (
      'hot_lead','follow_up','interested','not_interested','callback','no_answer','wrong_number','closed_converted'
    ) THEN
      RAISE EXCEPTION 'invalid or missing call report category';
    END IF;
    IF NEW.category IN ('follow_up','callback') AND (NEW.follow_up_at IS NULL OR coalesce(btrim(NEW.note), '') = '') THEN
      RAISE EXCEPTION 'follow-up requires date, time and note';
    END IF;
    IF NEW.category = 'hot_lead' AND coalesce(btrim(NEW.note), '') = '' THEN
      RAISE EXCEPTION 'hot lead requires a status note';
    END IF;
    IF NEW.category IN ('not_interested','wrong_number') AND coalesce(btrim(NEW.reason), '') = '' THEN
      RAISE EXCEPTION 'this category requires a reason';
    END IF;
    IF NEW.submitted_at IS NULL THEN NEW.submitted_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER call_reports_validate
  BEFORE INSERT OR UPDATE ON public.call_reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_call_report();

-- one open report per agent at a time -> enforces the next-lead lock
CREATE UNIQUE INDEX IF NOT EXISTS call_reports_one_pending_per_agent
  ON public.call_reports(agent_id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.has_pending_call_report(_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.call_reports WHERE agent_id = _agent_id AND status = 'pending')
$$;

-- 4. Follow-up calendar events
CREATE TABLE IF NOT EXISTS public.follow_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.call_reports(id) ON DELETE CASCADE,
  recording_id uuid REFERENCES public.call_recordings(id) ON DELETE SET NULL,
  customer_name text,
  phone_number text,
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  note text,
  scheduled_at timestamptz NOT NULL,
  reminder_minutes integer NOT NULL DEFAULT 15,
  status text NOT NULL DEFAULT 'upcoming',
  notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS follow_up_events_agent_time_idx ON public.follow_up_events(agent_id, scheduled_at);
GRANT SELECT, INSERT, UPDATE ON public.follow_up_events TO authenticated;
GRANT ALL ON public.follow_up_events TO service_role;
ALTER TABLE public.follow_up_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own follow-ups or supervisors read all" ON public.follow_up_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader') OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = follow_up_events.agent_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Agents update own follow-ups" ON public.follow_up_events
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = follow_up_events.agent_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = follow_up_events.agent_id AND p.user_id = auth.uid()));
CREATE TRIGGER follow_up_events_touch BEFORE UPDATE ON public.follow_up_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Lead assignment history (assign / reassign audit)
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'coordinator',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_assignments_lead_idx ON public.lead_assignments(lead_id, created_at DESC);
GRANT SELECT ON public.lead_assignments TO authenticated;
GRANT ALL ON public.lead_assignments TO service_role;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supervisors read assignment history" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));

-- 6. Android release channel
CREATE TABLE IF NOT EXISTS public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code integer NOT NULL,
  version_name text NOT NULL,
  storage_path text NOT NULL DEFAULT 'winstone-connect.apk',
  release_notes text,
  is_mandatory boolean NOT NULL DEFAULT false,
  released_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_releases_version_code_key ON public.app_releases(version_code);
GRANT SELECT ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read releases" ON public.app_releases
  FOR SELECT TO authenticated USING (true);

-- 7. Persisted critical system alerts
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  detail text,
  action text,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_alerts_open_idx ON public.system_alerts(created_at DESC) WHERE acknowledged_at IS NULL;
GRANT SELECT, UPDATE ON public.system_alerts TO authenticated;
GRANT ALL ON public.system_alerts TO service_role;
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supervisors read alerts" ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));
CREATE POLICY "Admins acknowledge alerts" ON public.system_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Documentation CMS
CREATE TABLE IF NOT EXISTS public.doc_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  summary text,
  body_markdown text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_pages_status_idx ON public.doc_pages(status, category, sort_order);
GRANT SELECT ON public.doc_pages TO anon;
GRANT SELECT, INSERT, UPDATE ON public.doc_pages TO authenticated;
GRANT ALL ON public.doc_pages TO service_role;
ALTER TABLE public.doc_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads published docs" ON public.doc_pages
  FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "Signed-in read published, admins read all" ON public.doc_pages
  FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write docs" ON public.doc_pages
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins edit docs" ON public.doc_pages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER doc_pages_touch BEFORE UPDATE ON public.doc_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();