ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS profession text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS city_area text,
  ADD COLUMN IF NOT EXISTS lead_quality text,
  ADD COLUMN IF NOT EXISTS best_channel text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS lead_type text,
  ADD COLUMN IF NOT EXISTS data_completeness text,
  ADD COLUMN IF NOT EXISTS missing_fields text,
  ADD COLUMN IF NOT EXISTS outreach_en text,
  ADD COLUMN IF NOT EXISTS outreach_bn text;