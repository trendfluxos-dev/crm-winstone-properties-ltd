-- 1 & 2: internal SECURITY DEFINER helpers should not be callable from the API
REVOKE EXECUTE ON FUNCTION public.sync_profile_role_to_user_roles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_license(text) FROM anon, authenticated;

-- 3: call-audio storage policy must honour both assignment columns
DROP POLICY IF EXISTS "Users can read audio for assigned leads" ON storage.objects;
CREATE POLICY "Users can read audio for assigned leads"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'call-audio'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'team_leader'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.profiles p
        ON p.id = l.assigned_to OR p.id = l.assigned_agent_id
      WHERE l.id::text = split_part(storage.objects.name, '/', 2)
        AND p.user_id = auth.uid()
    )
  )
);

-- 4: pin_hash is credential material — no signed-in role may read it
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, user_id, name, phone, email, employee_id, role, requested_role,
  approval_status, is_active, status, avatar_hue, presence,
  current_call_started_at, last_active_at, sim_number, sim_bound_at, created_at
) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;