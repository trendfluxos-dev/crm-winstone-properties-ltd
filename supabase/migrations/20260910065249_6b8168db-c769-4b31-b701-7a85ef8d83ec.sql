DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;

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
      SELECT 1 FROM public.leads l
      WHERE l.id::text = split_part(storage.objects.name, '/', 2)
        AND l.assigned_to = auth.uid()
    )
  )
);