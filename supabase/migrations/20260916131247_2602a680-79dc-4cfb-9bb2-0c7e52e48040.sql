DROP POLICY IF EXISTS "Users can read own or admin/team_leader read all profiles" ON public.profiles;

CREATE POLICY "Users read own profile; admins read all"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));