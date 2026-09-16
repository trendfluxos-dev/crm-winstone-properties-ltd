CREATE TABLE public.app_artifact_checksums (
  artifact_key TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('published', 'bundled')),
  filename TEXT NOT NULL,
  size_bytes BIGINT,
  sha256 TEXT,
  computed_at TIMESTAMP WITH TIME ZONE,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_artifact_checksums TO service_role;

ALTER TABLE public.app_artifact_checksums ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER app_artifact_checksums_touch
BEFORE UPDATE ON public.app_artifact_checksums
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();