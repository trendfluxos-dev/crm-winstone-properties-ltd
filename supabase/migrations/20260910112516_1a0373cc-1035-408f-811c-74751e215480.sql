REVOKE ALL ON FUNCTION public.has_active_license(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_license(text) TO service_role;