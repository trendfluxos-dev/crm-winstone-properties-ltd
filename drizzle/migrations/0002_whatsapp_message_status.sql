ALTER TABLE public.whatsapp_interactions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'logged',
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_detail text;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_interactions_provider_message_id_key
  ON public.whatsapp_interactions (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_interactions_lead_created_idx
  ON public.whatsapp_interactions (lead_id, created_at);