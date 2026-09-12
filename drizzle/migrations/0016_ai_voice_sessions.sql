-- Live AI voice (Twilio ConversationRelay) sessions and turn-by-turn transcript.

CREATE TABLE IF NOT EXISTS public.ai_voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  call_sid text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  from_number text,
  to_number text,
  direction text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'active',
  language text NOT NULL DEFAULT 'bn-IN',
  handoff_reason text,
  handoff_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  turn_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_voice_sessions_call_sid_key
  ON public.ai_voice_sessions (call_sid) WHERE call_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_voice_sessions_started_idx
  ON public.ai_voice_sessions (started_at DESC);

GRANT SELECT ON public.ai_voice_sessions TO authenticated;
GRANT ALL ON public.ai_voice_sessions TO service_role;
ALTER TABLE public.ai_voice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authority reads ai voice sessions" ON public.ai_voice_sessions;
CREATE POLICY "Authority reads ai voice sessions"
ON public.ai_voice_sessions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.profiles p ON p.id = l.assigned_to
    WHERE l.id = ai_voice_sessions.lead_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins manage ai voice sessions" ON public.ai_voice_sessions;
CREATE POLICY "Admins manage ai voice sessions"
ON public.ai_voice_sessions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ai_voice_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_row_id uuid NOT NULL REFERENCES public.ai_voice_sessions(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  language text,
  interrupted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_voice_turns_session_index_key
  ON public.ai_voice_turns (session_row_id, turn_index);

GRANT SELECT ON public.ai_voice_turns TO authenticated;
GRANT ALL ON public.ai_voice_turns TO service_role;
ALTER TABLE public.ai_voice_turns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authority reads ai voice turns" ON public.ai_voice_turns;
CREATE POLICY "Authority reads ai voice turns"
ON public.ai_voice_turns FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.ai_voice_sessions s
    JOIN public.leads l ON l.id = s.lead_id
    JOIN public.profiles p ON p.id = l.assigned_to
    WHERE s.id = ai_voice_turns.session_row_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins manage ai voice turns" ON public.ai_voice_turns;
CREATE POLICY "Admins manage ai voice turns"
ON public.ai_voice_turns FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));