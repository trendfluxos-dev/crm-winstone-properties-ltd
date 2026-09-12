DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;

CREATE POLICY "Users can create own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'agent'::app_role
  AND approval_status = 'pending'
  AND requested_role IN ('agent'::app_role, 'team_leader'::app_role)
);