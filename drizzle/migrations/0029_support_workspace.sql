-- AI customer-support workspace (additive; independent of the sales CRM tables)

CREATE TABLE public.support_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  name text,
  phone text,
  company text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX support_customers_email_key ON public.support_customers (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE public.support_article_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  body_markdown text NOT NULL,
  category_id uuid REFERENCES public.support_article_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  tags text[] NOT NULL DEFAULT '{}',
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  view_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body_markdown, ''))
  ) STORED
);
CREATE INDEX support_articles_search_idx ON public.support_articles USING gin (search_tsv);
CREATE INDEX support_articles_status_idx ON public.support_articles (status, updated_at DESC);

CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.support_customers(id) ON DELETE CASCADE,
  access_token text NOT NULL UNIQUE,
  subject text,
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'email', 'whatsapp', 'phone')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category text,
  intent text,
  sentiment text,
  summary text,
  tags text[] NOT NULL DEFAULT '{}',
  ai_handled boolean NOT NULL DEFAULT true,
  escalated_at timestamptz,
  escalation_reason text,
  unread_for_agent boolean NOT NULL DEFAULT true,
  unread_for_customer boolean NOT NULL DEFAULT false,
  message_count integer NOT NULL DEFAULT 0,
  first_customer_message_at timestamptz,
  first_human_response_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  sla_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_conversations_queue_idx ON public.support_conversations (status, priority, last_message_at DESC);
CREATE INDEX support_conversations_customer_idx ON public.support_conversations (customer_id, last_message_at DESC);
CREATE INDEX support_conversations_assignee_idx ON public.support_conversations (assignee_profile_id, status);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  author_kind text NOT NULL CHECK (author_kind IN ('customer', 'ai', 'agent', 'system')),
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_label text,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_model text,
  ai_confidence numeric,
  ai_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_needs_human boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_conversation_idx ON public.support_messages (conversation_id, created_at);

CREATE SEQUENCE public.support_ticket_ref_seq START 1;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT ('TKT-' || lpad(nextval('public.support_ticket_ref_seq')::text, 5, '0')),
  title text NOT NULL,
  description text,
  customer_id uuid NOT NULL REFERENCES public.support_customers(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.support_conversations(id) ON DELETE SET NULL,
  category text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  assignee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_by_kind text NOT NULL DEFAULT 'ai' CHECK (created_by_kind IN ('ai', 'agent', 'customer')),
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_status_idx ON public.support_tickets (status, priority, created_at DESC);
CREATE INDEX support_tickets_customer_idx ON public.support_tickets (customer_id, created_at DESC);

CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail text,
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('ai', 'agent', 'customer', 'system')),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_events_ticket_idx ON public.support_ticket_events (ticket_id, created_at DESC);

CREATE TABLE public.support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.support_customers(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_notes_conversation_idx ON public.support_notes (conversation_id, created_at DESC);
CREATE INDEX support_notes_ticket_idx ON public.support_notes (ticket_id, created_at DESC);
CREATE INDEX support_notes_customer_idx ON public.support_notes (customer_id, created_at DESC);

CREATE TABLE public.support_canned_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_csat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX support_csat_conversation_key ON public.support_csat (conversation_id);

-- Grants. Every read/write path goes through server functions that resolve the
-- caller first (PIN authority sessions carry no JWT), so only the published
-- knowledge base is reachable with the anon key.
GRANT SELECT ON public.support_articles TO anon, authenticated;
GRANT SELECT ON public.support_article_categories TO anon, authenticated;
GRANT ALL ON public.support_customers TO service_role;
GRANT ALL ON public.support_article_categories TO service_role;
GRANT ALL ON public.support_articles TO service_role;
GRANT ALL ON public.support_conversations TO service_role;
GRANT ALL ON public.support_messages TO service_role;
GRANT ALL ON public.support_tickets TO service_role;
GRANT ALL ON public.support_ticket_events TO service_role;
GRANT ALL ON public.support_notes TO service_role;
GRANT ALL ON public.support_canned_replies TO service_role;
GRANT ALL ON public.support_settings TO service_role;
GRANT ALL ON public.support_csat TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_ref_seq TO service_role;

ALTER TABLE public.support_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_canned_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_csat ENABLE ROW LEVEL SECURITY;

-- Published knowledge base is the only publicly readable support data.
CREATE POLICY "Published articles are public"
  ON public.support_articles FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Article categories are public"
  ON public.support_article_categories FOR SELECT TO anon, authenticated
  USING (true);

-- Approved staff may read operational support data directly; writes stay on the server.
CREATE POLICY "Staff read conversations"
  ON public.support_conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.approval_status = 'approved' AND p.is_active
    )
  );

CREATE POLICY "Staff read messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.approval_status = 'approved' AND p.is_active
    )
  );

CREATE POLICY "Staff read tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.approval_status = 'approved' AND p.is_active
    )
  );

GRANT SELECT ON public.support_conversations TO authenticated;
GRANT SELECT ON public.support_messages TO authenticated;
GRANT SELECT ON public.support_tickets TO authenticated;

INSERT INTO public.support_settings (id, data) VALUES (
  'support',
  jsonb_build_object(
    'ai_enabled', true,
    'ai_confidence_threshold', 0.55,
    'ai_persona', 'Winstone Support AI',
    'auto_escalate_on_low_confidence', true,
    'business_hours', jsonb_build_object(
      'timezone', 'Asia/Dhaka',
      'start', '09:00',
      'end', '18:00',
      'days', jsonb_build_array(0, 1, 2, 3, 4)
    ),
    'sla_first_response_minutes', 60,
    'sla_resolution_minutes', 1440,
    'notify_on_escalation', true,
    'email_channel_configured', false
  )
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.support_article_categories (slug, name, description, sort_order) VALUES
  ('getting-started', 'Getting started', 'Account setup and first steps', 1),
  ('billing', 'Billing & payments', 'Invoices, plans and refunds', 2),
  ('troubleshooting', 'Troubleshooting', 'Fixing common problems', 3),
  ('policies', 'Policies', 'Terms, privacy and service policies', 4)
ON CONFLICT (slug) DO NOTHING;
