ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Data flows through PIN-gated server functions (service role); direct client access is denied.
-- Service role bypasses RLS automatically; no policies are created for anon/authenticated.
REVOKE ALL ON public.custom_reports FROM anon, authenticated;
REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT ALL ON public.custom_reports TO service_role;
GRANT ALL ON public.system_settings TO service_role;