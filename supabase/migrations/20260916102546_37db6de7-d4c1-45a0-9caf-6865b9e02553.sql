REVOKE ALL ON public.app_artifact_checksums FROM anon;
REVOKE ALL ON public.app_artifact_checksums FROM authenticated;
GRANT ALL ON public.app_artifact_checksums TO service_role;