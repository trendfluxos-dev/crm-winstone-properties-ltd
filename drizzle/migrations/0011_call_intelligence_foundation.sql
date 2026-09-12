-- Phase 1 foundation for the Android agent companion.
-- Additive only: existing tables (call_recordings = the call record + recording,
-- call_reports, agent_devices) are extended, never replaced.

-- 1) Call lifecycle + storage metadata on the existing recording/call row.
ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS call_source text NOT NULL DEFAULT 'android_sim',
  ADD COLUMN IF NOT EXISTS call_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS external_call_id text,
  ADD COLUMN IF NOT EXISTS agent_phone text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS call_recordings_external_call_id_key
  ON public.call_recordings (external_call_id) WHERE external_call_id IS NOT NULL;

DROP TRIGGER IF EXISTS call_recordings_touch ON public.call_recordings;
CREATE TRIGGER call_recordings_touch BEFORE UPDATE ON public.call_recordings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Device inventory fields the phone reports at binding time.
ALTER TABLE public.agent_devices
  ADD COLUMN IF NOT EXISTS device_uid text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS android_version text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS recording_capable boolean,
  ADD COLUMN IF NOT EXISTS recording_tested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_note text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS agent_devices_device_uid_key
  ON public.agent_devices (device_uid) WHERE device_uid IS NOT NULL;

-- 3) Retry-safe processing jobs (recording upload / transcription / AI).
CREATE TABLE IF NOT EXISTS public.call_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.call_recordings(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  provider text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_id, job_type)
);

CREATE INDEX IF NOT EXISTS call_processing_jobs_status_idx
  ON public.call_processing_jobs (status, created_at);

GRANT SELECT ON public.call_processing_jobs TO authenticated;
GRANT ALL ON public.call_processing_jobs TO service_role;
ALTER TABLE public.call_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs readable by owner or management" ON public.call_processing_jobs;
CREATE POLICY "jobs readable by owner or management"
ON public.call_processing_jobs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1
    FROM public.call_recordings r
    JOIN public.profiles p ON p.id = r.agent_id
    WHERE r.id = call_processing_jobs.recording_id
      AND p.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS call_processing_jobs_touch ON public.call_processing_jobs;
CREATE TRIGGER call_processing_jobs_touch BEFORE UPDATE ON public.call_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Offline-first sync events from the phone (idempotent by key).
CREATE TABLE IF NOT EXISTS public.sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.agent_devices(id) ON DELETE SET NULL,
  idempotency_key text,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_events_idempotency_key_key
  ON public.sync_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sync_events_status_idx ON public.sync_events (status, created_at);

GRANT SELECT ON public.sync_events TO authenticated;
GRANT ALL ON public.sync_events TO service_role;
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync events readable by owner or management" ON public.sync_events;
CREATE POLICY "sync events readable by owner or management"
ON public.sync_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = sync_events.agent_id AND p.user_id = auth.uid()
  )
);