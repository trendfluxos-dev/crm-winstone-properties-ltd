ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS daily_lead_quota integer;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_daily_lead_quota_range
  CHECK (daily_lead_quota IS NULL OR (daily_lead_quota >= 0 AND daily_lead_quota <= 500));