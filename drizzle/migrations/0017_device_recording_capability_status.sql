ALTER TABLE public.agent_devices
  ADD COLUMN IF NOT EXISTS recording_mode text,
  ADD COLUMN IF NOT EXISTS recording_checked_at timestamptz;

ALTER TABLE public.agent_devices
  DROP CONSTRAINT IF EXISTS agent_devices_recording_mode_check;

ALTER TABLE public.agent_devices
  ADD CONSTRAINT agent_devices_recording_mode_check
  CHECK (recording_mode IS NULL OR recording_mode IN ('two_sided', 'mic_only', 'unavailable'));

CREATE INDEX IF NOT EXISTS agent_devices_recording_checked_at_idx
  ON public.agent_devices (recording_checked_at DESC);