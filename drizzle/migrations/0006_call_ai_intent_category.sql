ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS ai_intent text,
  ADD COLUMN IF NOT EXISTS ai_lead_category text,
  ADD COLUMN IF NOT EXISTS ai_next_action text;