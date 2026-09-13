-- Fix ownership checks: leads.assigned_to stores profiles.id, not auth.uid()

drop policy if exists "Users can read recordings for assigned leads or admin/team_lead" on public.call_recordings;
create policy "Users can read recordings for assigned leads or admin/team_lead"
on public.call_recordings for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'team_leader')
  or exists (
    select 1 from public.leads l
    join public.profiles p on p.id = l.assigned_to or p.id = l.assigned_agent_id
    where l.id = call_recordings.lead_id
      and p.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.id = call_recordings.agent_id and p.user_id = auth.uid()
  )
);

drop policy if exists "Users can read messages for assigned leads or admin/team_leader" on public.whatsapp_interactions;
create policy "Users can read messages for assigned leads or admin/team_leader"
on public.whatsapp_interactions for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'team_leader')
  or exists (
    select 1 from public.leads l
    join public.profiles p on p.id = l.assigned_to or p.id = l.assigned_agent_id
    where l.id = whatsapp_interactions.lead_id
      and p.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.id = whatsapp_interactions.agent_id and p.user_id = auth.uid()
  )
);

drop policy if exists "Agents create own follow-ups" on public.follow_up_events;
create policy "Agents create own follow-ups"
on public.follow_up_events for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'team_leader')
  or (
    agent_id in (select p.id from public.profiles p where p.user_id = auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = follow_up_events.lead_id
        and (l.assigned_to = follow_up_events.agent_id or l.assigned_agent_id = follow_up_events.agent_id)
    )
  )
);

drop policy if exists "Agents file own classifications" on public.lead_classifications;
create policy "Agents file own classifications"
on public.lead_classifications for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'team_leader')
  or (
    agent_id in (select p.id from public.profiles p where p.user_id = auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = lead_classifications.lead_id
        and (l.assigned_to = lead_classifications.agent_id or l.assigned_agent_id = lead_classifications.agent_id)
    )
  )
);