drop policy if exists "Users can read audio for assigned leads" on storage.objects;

create policy "Users can read audio for assigned leads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'call-audio'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'team_leader')
    or exists (
      select 1
      from public.leads l
      join public.profiles p on p.id = l.assigned_to
      where l.id::text = split_part(objects.name, '/', 2)
        and p.user_id = auth.uid()
    )
  )
);