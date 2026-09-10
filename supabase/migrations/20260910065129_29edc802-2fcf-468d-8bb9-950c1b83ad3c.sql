CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, role
FROM public.profiles
WHERE user_id IS NOT NULL AND role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_profile_role_to_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL OR NEW.role IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = NEW.user_id
    AND role IS DISTINCT FROM NEW.role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, NEW.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_role ON public.profiles;
CREATE TRIGGER profiles_sync_role
AFTER INSERT OR UPDATE OF role, user_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_to_user_roles();

DROP POLICY IF EXISTS "profiles open access (pre-auth phase)" ON public.profiles;
DROP POLICY IF EXISTS "leads open access (pre-auth phase)" ON public.leads;
DROP POLICY IF EXISTS "call_recordings open access (pre-auth phase)" ON public.call_recordings;
DROP POLICY IF EXISTS "whatsapp open access (pre-auth phase)" ON public.whatsapp_interactions;

DROP POLICY IF EXISTS "Users can read own or admin/team_leader read all profiles" ON public.profiles;
CREATE POLICY "Users can read own or admin/team_leader read all profiles"
ON public.profiles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
CREATE POLICY "Users can update own profile except role"
ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
);

DROP POLICY IF EXISTS "Users can read assigned or admin/team_leader read all leads" ON public.leads;
CREATE POLICY "Users can read assigned or admin/team_leader read all leads"
ON public.leads
FOR SELECT TO authenticated
USING (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
);

DROP POLICY IF EXISTS "Admin/team_leader can insert leads" ON public.leads;
CREATE POLICY "Admin/team_leader can insert leads"
ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
);

DROP POLICY IF EXISTS "Users can update assigned leads or admin/team_leader update all" ON public.leads;
CREATE POLICY "Users can update assigned leads or admin/team_leader update all"
ON public.leads
FOR UPDATE TO authenticated
USING (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
)
WITH CHECK (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
);

DROP POLICY IF EXISTS "Admins can delete leads" ON public.leads;
CREATE POLICY "Admins can delete leads"
ON public.leads
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read recordings for assigned leads or admin/team_leader read all" ON public.call_recordings;
CREATE POLICY "Users can read recordings for assigned leads or admin/team_leader read all"
ON public.call_recordings
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = call_recordings.lead_id
      AND assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage recordings" ON public.call_recordings;
CREATE POLICY "Admins can manage recordings"
ON public.call_recordings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read messages for assigned leads or admin/team_leader read all" ON public.whatsapp_interactions;
CREATE POLICY "Users can read messages for assigned leads or admin/team_leader read all"
ON public.whatsapp_interactions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = whatsapp_interactions.lead_id
      AND assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage whatsapp interactions" ON public.whatsapp_interactions;
CREATE POLICY "Admins can manage whatsapp interactions"
ON public.whatsapp_interactions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read audio for assigned leads" ON storage.objects;
CREATE POLICY "Users can read audio for assigned leads"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'call-audio'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'team_leader')
    OR EXISTS (
      SELECT 1 FROM public.leads
      WHERE id::text = split_part(name, '/', 2)
        AND assigned_to = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins can manage call audio storage" ON storage.objects;
CREATE POLICY "Admins can manage call audio storage"
ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'call-audio'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'call-audio'
  AND public.has_role(auth.uid(), 'admin')
);