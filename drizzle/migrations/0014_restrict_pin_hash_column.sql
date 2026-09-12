-- Lock down the PIN hash column: nobody reading through the Data API
-- (anon / authenticated, including team leaders) may select it any more.
-- Only the privileged service role (server-side code) keeps access.
REVOKE SELECT (pin_hash) ON public.profiles FROM anon;
REVOKE SELECT (pin_hash) ON public.profiles FROM authenticated;
GRANT SELECT (pin_hash) ON public.profiles TO service_role;