-- Phase 1: consent, do-not-contact and webhook delivery observability

CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  channel text NOT NULL DEFAULT 'voice',
  consent_type text NOT NULL DEFAULT 'recording',
  granted boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'agent',
  note text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_records_phone_idx ON public.consent_records (phone_number, consent_type, created_at DESC);

GRANT SELECT ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read consent for own leads or supervisors" ON public.consent_records;
CREATE POLICY "Read consent for own leads or supervisors"
  ON public.consent_records FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'team_leader'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.profiles p ON p.id = l.assigned_to
      WHERE l.id = consent_records.lead_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage consent" ON public.consent_records;
CREATE POLICY "Admins manage consent"
  ON public.consent_records FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.do_not_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  channel text NOT NULL DEFAULT 'all',
  reason text,
  source text NOT NULL DEFAULT 'manual',
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS do_not_contact_phone_channel_key
  ON public.do_not_contact (phone_number, channel);

GRANT SELECT ON public.do_not_contact TO authenticated;
GRANT ALL ON public.do_not_contact TO service_role;
ALTER TABLE public.do_not_contact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read do-not-contact" ON public.do_not_contact;
CREATE POLICY "Staff read do-not-contact"
  ON public.do_not_contact FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_active));

DROP POLICY IF EXISTS "Admins manage do-not-contact" ON public.do_not_contact;
CREATE POLICY "Admins manage do-not-contact"
  ON public.do_not_contact FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received',
  attempts integer NOT NULL DEFAULT 1,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_provider_event_key
  ON public.webhook_deliveries (provider, event_id, event_type);
CREATE INDEX IF NOT EXISTS webhook_deliveries_created_idx
  ON public.webhook_deliveries (created_at DESC);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors read webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Supervisors read webhook deliveries"
  ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'team_leader'::app_role));