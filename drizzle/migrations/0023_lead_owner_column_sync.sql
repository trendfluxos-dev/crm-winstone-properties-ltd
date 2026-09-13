-- Leads carry two owner columns (assigned_to, assigned_agent_id). Access checks
-- that read only one of them can disagree about who owns a lead. This keeps the
-- two columns identical at the database level so every check agrees.
CREATE OR REPLACE FUNCTION public.sync_lead_owner_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      owner := NEW.assigned_to;
    ELSIF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      owner := NEW.assigned_agent_id;
    ELSE
      owner := COALESCE(NEW.assigned_to, NEW.assigned_agent_id);
    END IF;
  ELSE
    owner := COALESCE(NEW.assigned_to, NEW.assigned_agent_id);
  END IF;

  NEW.assigned_to := owner;
  NEW.assigned_agent_id := owner;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_lead_owner_columns ON public.leads;
CREATE TRIGGER sync_lead_owner_columns
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_owner_columns();

UPDATE public.leads
SET assigned_to = COALESCE(assigned_to, assigned_agent_id)
WHERE assigned_to IS DISTINCT FROM assigned_agent_id;