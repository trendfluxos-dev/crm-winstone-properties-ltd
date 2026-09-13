create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('command_agent','transcription','analysis','doc_summary','other')),
  model text,
  units numeric not null default 1,
  est_credits numeric not null,
  actor_profile_id uuid references public.profiles(id),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_created_idx on public.ai_usage_events(created_at desc);
create index if not exists ai_usage_events_category_idx on public.ai_usage_events(category, created_at desc);

grant select on public.ai_usage_events to authenticated;
grant all on public.ai_usage_events to service_role;

alter table public.ai_usage_events enable row level security;

create policy "Authority and coordinators read ai usage"
on public.ai_usage_events for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'team_leader'));