-- 1. Extend the usage ledger with real cost detail
ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS operation text,
  ADD COLUMN IF NOT EXISTS unit_kind text NOT NULL DEFAULT 'call',
  ADD COLUMN IF NOT EXISTS input_units numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_units numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_credits numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS rate_card_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS latency_ms integer;

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_events_idempotency_key_uidx
  ON public.ai_usage_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx
  ON public.ai_usage_events (created_at);

-- 2. Provider rate cards
CREATE TABLE IF NOT EXISTS public.provider_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text,
  operation text,
  unit_kind text NOT NULL DEFAULT 'call',
  credits_per_unit numeric NOT NULL DEFAULT 0,
  amount_per_unit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_rate_cards TO authenticated;
GRANT ALL ON public.provider_rate_cards TO service_role;
ALTER TABLE public.provider_rate_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate cards readable by admins"
  ON public.provider_rate_cards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER provider_rate_cards_touch BEFORE UPDATE ON public.provider_rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS provider_rate_cards_lookup_idx
  ON public.provider_rate_cards (provider, model, operation, effective_from DESC);

-- 3. Budgets and caps
CREATE TABLE IF NOT EXISTS public.billing_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'org',
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_credit_budget numeric NOT NULL DEFAULT 0,
  alert_thresholds integer[] NOT NULL DEFAULT ARRAY[50,80,100],
  hard_cap boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_budgets TO authenticated;
GRANT ALL ON public.billing_budgets TO service_role;
ALTER TABLE public.billing_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets readable by admins"
  ON public.billing_budgets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER billing_budgets_touch BEFORE UPDATE ON public.billing_budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS billing_budgets_org_uidx
  ON public.billing_budgets (scope) WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS billing_budgets_agent_uidx
  ON public.billing_budgets (profile_id) WHERE profile_id IS NOT NULL;

-- 4. Frozen monthly invoices
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'closed',
  total_calls integer NOT NULL DEFAULT 0,
  total_credits numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  generation_hash text NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_invoices TO service_role;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices readable by admins"
  ON public.billing_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER billing_invoices_touch BEFORE UPDATE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.billing_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  credits numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_invoice_lines TO authenticated;
GRANT ALL ON public.billing_invoice_lines TO service_role;
ALTER TABLE public.billing_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice lines readable by admins"
  ON public.billing_invoice_lines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS billing_invoice_lines_invoice_idx
  ON public.billing_invoice_lines (invoice_id, dimension);

-- 5. Seed the rate cards with the previously hard-coded flat estimates
INSERT INTO public.provider_rate_cards (provider, model, operation, unit_kind, credits_per_unit, note)
SELECT * FROM (VALUES
  ('lovable-ai', NULL, 'command_agent', 'call', 0.25, 'migrated from flat AI_USAGE_RATES'),
  ('lovable-ai', NULL, 'analysis', 'call', 0.03, 'migrated from flat AI_USAGE_RATES'),
  ('lovable-ai', NULL, 'doc_summary', 'call', 0.03, 'migrated from flat AI_USAGE_RATES'),
  ('lovable-ai', NULL, 'other', 'call', 0.01, 'migrated from flat AI_USAGE_RATES'),
  ('sarvam', NULL, 'transcription', 'call', 0.02, 'migrated from flat AI_USAGE_RATES')
) AS v(provider, model, operation, unit_kind, credits_per_unit, note)
WHERE NOT EXISTS (SELECT 1 FROM public.provider_rate_cards);