-- Restrict the pin_hash credential column to service_role only.
-- Team leaders, agents and anonymous clients can still read every other profile
-- field through existing RLS policies, but they can no longer select pin_hash.
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  name,
  phone,
  email,
  employee_id,
  role,
  requested_role,
  approval_status,
  is_active,
  status,
  avatar_hue,
  presence,
  current_call_started_at,
  last_active_at,
  sim_number,
  sim_bound_at,
  created_at
) ON public.profiles TO anon, authenticated;

-- Preserve existing write access for authenticated app users.
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO anon;

-- Service role (server-side code) keeps full access including pin_hash.
GRANT ALL ON public.profiles TO service_role;
