CREATE TABLE public.service_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  billing_date date NOT NULL,
  due_at timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  status text NOT NULL DEFAULT 'due',
  reference text NOT NULL UNIQUE,
  paid_at timestamptz,
  service_active_until timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.service_invoices TO service_role;
ALTER TABLE public.service_invoices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER service_invoices_touch BEFORE UPDATE ON public.service_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.service_invoices(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_txn_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  status text NOT NULL DEFAULT 'pending',
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_at timestamptz,
  failure_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_txn_id)
);
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER payment_transactions_touch BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.billing_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.service_invoices(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, kind)
);
GRANT ALL ON public.billing_allocations TO service_role;
ALTER TABLE public.billing_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.architect_payout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_name text NOT NULL,
  bank_name text NOT NULL,
  branch_name text,
  currency text NOT NULL DEFAULT 'BDT',
  account_number_encrypted text,
  account_number_masked text,
  routing_number text,
  is_active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.architect_payout_profiles TO service_role;
ALTER TABLE public.architect_payout_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER architect_payout_profiles_touch BEFORE UPDATE ON public.architect_payout_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.architect_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.service_invoices(id) ON DELETE CASCADE,
  allocation_id uuid REFERENCES public.billing_allocations(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.architect_payout_profiles(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  status text NOT NULL DEFAULT 'pending',
  provider text,
  provider_reference text,
  requested_at timestamptz,
  confirmed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.architect_payouts TO service_role;
ALTER TABLE public.architect_payouts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER architect_payouts_touch BEFORE UPDATE ON public.architect_payouts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();