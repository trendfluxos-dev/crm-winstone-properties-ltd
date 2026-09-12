ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS stt_provider text,
  ADD COLUMN IF NOT EXISTS stt_model text,
  ADD COLUMN IF NOT EXISTS stt_language text,
  ADD COLUMN IF NOT EXISTS stt_fallback_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stt_error_code text,
  ADD COLUMN IF NOT EXISTS stt_error_message text,
  ADD COLUMN IF NOT EXISTS transcribed_at timestamptz;