ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS stt_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stt_request_id text,
  ADD COLUMN IF NOT EXISTS stt_duration_ms integer;

CREATE INDEX IF NOT EXISTS idx_call_recordings_stt_status
  ON public.call_recordings (stt_status);