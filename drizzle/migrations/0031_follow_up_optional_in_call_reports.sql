CREATE OR REPLACE FUNCTION public.validate_call_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'submitted' THEN
    IF NEW.category IS NULL OR NEW.category NOT IN (
      'hot_lead','follow_up','interested','not_interested','callback','no_answer','wrong_number','closed_converted'
    ) THEN
      RAISE EXCEPTION 'invalid or missing call report category';
    END IF;
    IF coalesce(btrim(NEW.summary), '') = '' THEN
      RAISE EXCEPTION 'call summary is required';
    END IF;
    IF coalesce(btrim(NEW.note), '') = '' THEN
      RAISE EXCEPTION 'call note is required';
    END IF;
    -- Follow-up is optional: a NULL follow_up_at means "no follow-up needed".
    IF NEW.category IN ('not_interested','wrong_number') AND coalesce(btrim(NEW.reason), '') = '' THEN
      RAISE EXCEPTION 'this category requires a reason';
    END IF;
    IF NEW.connected THEN
      IF NEW.temperature IS NULL OR NEW.temperature NOT IN ('hot','warm','cold') THEN
        RAISE EXCEPTION 'a received call requires a temperature classification';
      END IF;
      IF NEW.grade IS NULL OR NEW.grade NOT IN ('A','B','C','D') THEN
        RAISE EXCEPTION 'a received call requires a grade classification';
      END IF;
    END IF;
    IF NEW.submitted_at IS NULL THEN NEW.submitted_at = now(); END IF;
  END IF;
  RETURN NEW;
END;
$function$;