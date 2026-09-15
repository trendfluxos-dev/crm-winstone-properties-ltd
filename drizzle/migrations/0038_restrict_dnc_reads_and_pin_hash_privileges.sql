-- 1. Do-not-contact registry: server code reads it with the service role, so
-- client-side reads no longer need to expose the entire registry (phone numbers
-- and reasons) to every active staff account. Scope direct reads to supervisors.
DROP POLICY IF EXISTS "Staff read do-not-contact" ON public.do_not_contact;
DROP POLICY IF EXISTS "Supervisors read do-not-contact" ON public.do_not_contact;
CREATE POLICY "Supervisors read do-not-contact"
  ON public.do_not_contact FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'team_leader'::app_role)
  );

-- 2. profiles.pin_hash is an authentication credential. RLS cannot filter
-- columns, so enforce it with column privileges: no client role may select the
-- credential column, including team leaders reading other profiles. Re-asserted
-- here so the guarantee is explicit in the current schema.
REVOKE SELECT (pin_hash) ON public.profiles FROM anon;
REVOKE SELECT (pin_hash) ON public.profiles FROM authenticated;
REVOKE UPDATE (pin_hash) ON public.profiles FROM anon;
REVOKE UPDATE (pin_hash) ON public.profiles FROM authenticated;
REVOKE INSERT (pin_hash) ON public.profiles FROM anon;
REVOKE INSERT (pin_hash) ON public.profiles FROM authenticated;
GRANT SELECT (pin_hash), UPDATE (pin_hash), INSERT (pin_hash) ON public.profiles TO service_role;
COMMENT ON COLUMN public.profiles.pin_hash IS 'Credential hash. service_role only; never selectable by anon/authenticated.';