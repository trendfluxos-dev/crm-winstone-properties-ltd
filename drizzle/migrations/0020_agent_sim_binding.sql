ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sim_number text,
  ADD COLUMN IF NOT EXISTS sim_bound_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_sim_number_key
  ON public.profiles (right(regexp_replace(sim_number, '\D', '', 'g'), 11))
  WHERE sim_number IS NOT NULL;

ALTER TABLE public.agent_devices
  ADD COLUMN IF NOT EXISTS sim_verified_at timestamptz;
