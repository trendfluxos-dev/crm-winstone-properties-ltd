ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS ai_temperature text,
  ADD COLUMN IF NOT EXISTS ai_grade text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_recordings_ai_temperature_check'
  ) THEN
    ALTER TABLE public.call_recordings
      ADD CONSTRAINT call_recordings_ai_temperature_check
      CHECK (ai_temperature IS NULL OR ai_temperature IN ('hot','warm','cold'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_recordings_ai_grade_check'
  ) THEN
    ALTER TABLE public.call_recordings
      ADD CONSTRAINT call_recordings_ai_grade_check
      CHECK (ai_grade IS NULL OR ai_grade IN ('A','B','C','D'));
  END IF;
END $$;