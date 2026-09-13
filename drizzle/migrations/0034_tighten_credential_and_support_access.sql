-- 1. Agent PIN hashes: keep the credential column readable only by server-side code.
REVOKE SELECT (pin_hash) ON public.profiles FROM anon;
REVOKE SELECT (pin_hash) ON public.profiles FROM authenticated;
GRANT SELECT (pin_hash) ON public.profiles TO service_role;

-- 2. Realtime: stop replicating the credential column to subscribers. Column
-- privileges do not filter logical replication payloads, so the publication
-- itself must list the safe columns.
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles
  (id, user_id, name, phone, avatar_hue, role, is_active, presence,
   current_call_started_at, last_active_at, created_at, employee_id, status,
   approval_status, requested_role, email, sim_number, sim_bound_at);

-- 3. Support conversation access tokens authenticate customers; never expose
-- them to signed-in staff sessions. Server code uses the service role.
REVOKE SELECT (access_token) ON public.support_conversations FROM anon;
REVOKE SELECT (access_token) ON public.support_conversations FROM authenticated;
GRANT SELECT (access_token) ON public.support_conversations TO service_role;

-- 4. Support history: any approved, active profile could read every customer's
-- conversations, messages and tickets. Scope direct reads to supervisors;
-- agent-scoped access continues to run through server functions that check
-- assignment with the service role.
DROP POLICY IF EXISTS "Staff read conversations" ON public.support_conversations;
CREATE POLICY "Supervisors read conversations"
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));

DROP POLICY IF EXISTS "Staff read messages" ON public.support_messages;
CREATE POLICY "Supervisors read messages"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));

DROP POLICY IF EXISTS "Staff read tickets" ON public.support_tickets;
CREATE POLICY "Supervisors read tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader'));