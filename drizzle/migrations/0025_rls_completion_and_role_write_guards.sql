-- 1. Lead ownership policies were comparing leads.assigned_to (a profiles.id)
--    against auth.uid() (an auth user id), so agents could never see their own
--    leads through the Data API. Map through profiles instead.
DROP POLICY IF EXISTS "Users can read assigned or admin/team_leader read all leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update assigned leads or admin/team_leader update all" ON public.leads;

CREATE POLICY "Read own leads or supervisors read all"
ON public.leads FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.id = public.leads.assigned_to OR p.id = public.leads.assigned_agent_id)
  )
);

CREATE POLICY "Update own leads or supervisors update all"
ON public.leads FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.id = public.leads.assigned_to OR p.id = public.leads.assigned_agent_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.id = public.leads.assigned_to OR p.id = public.leads.assigned_agent_id)
  )
);

-- 2. A received lead can never reach COMPLETED without a full classification.
--    Runs for every writer, including the service role used by the app.
CREATE OR REPLACE FUNCTION public.enforce_lead_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.work_state = 'completed'
     AND (NEW.temperature IS NULL OR NEW.grade IS NULL) THEN
    RAISE EXCEPTION 'শ্রেণিবিন্যাস (Hot/Warm/Cold ও গ্রেড) ছাড়া লিড সম্পন্ন করা যাবে না';
  END IF;

  -- Only supervisors may hand a lead to another agent. auth.uid() is NULL for
  -- server-side work, which is gated in the application layer instead.
  IF TG_OP = 'UPDATE'
     AND auth.uid() IS NOT NULL
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'team_leader')) THEN
    RAISE EXCEPTION 'শুধুমাত্র কোঅর্ডিনেটর লিড বদল করতে পারবেন';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_lead_completion ON public.leads;
CREATE TRIGGER enforce_lead_completion
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_completion();

-- 3. Classification history: an agent may only file their own, supervisors any.
--    History is append-only (no UPDATE/DELETE policy).
GRANT INSERT ON public.lead_classifications TO authenticated;
DROP POLICY IF EXISTS "Agents file own classifications" ON public.lead_classifications;
CREATE POLICY "Agents file own classifications"
ON public.lead_classifications FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR agent_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 4. Follow-ups: agents may only create their own.
GRANT INSERT ON public.follow_up_events TO authenticated;
DROP POLICY IF EXISTS "Agents create own follow-ups" ON public.follow_up_events;
CREATE POLICY "Agents create own follow-ups"
ON public.follow_up_events FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'team_leader')
  OR agent_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
);
