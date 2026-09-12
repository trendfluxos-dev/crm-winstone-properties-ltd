CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recording_id uuid,
  kind text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_events_lead_created_idx ON public.lead_events (lead_id, created_at DESC);
CREATE INDEX lead_events_created_idx ON public.lead_events (created_at DESC);

GRANT SELECT ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read events for assigned leads or admin/team_lead"
ON public.lead_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'team_leader'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.id = l.assigned_to
    WHERE l.id = lead_events.lead_id AND p.user_id = auth.uid()
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_events;