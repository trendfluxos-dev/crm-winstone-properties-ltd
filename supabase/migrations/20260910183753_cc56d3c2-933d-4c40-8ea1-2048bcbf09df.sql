ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requested_role app_role NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles SET approval_status = 'approved' WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS profiles_approval_status_idx ON public.profiles (approval_status);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles (user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_profile_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid approval_status %', NEW.approval_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_approval ON public.profiles;
CREATE TRIGGER profiles_validate_approval
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_approval();