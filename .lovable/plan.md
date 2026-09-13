# AI Customer Support Workspace — added to the existing Winstone system

## What exists today (inspected)

This project is a working Bengali **outbound sales-call CRM** (Winstone): leads, agent desk, coordinator dispatch, Executive HQ, IT Console, Android companion app for SIM calls + recordings, transcription/AI analysis pipeline, Google Sheets/Drive/Docs sync, shift summaries, credit report, audit logs, role model (`authority` / `coordinator` / `agent`) resolved server-side in `src/lib/access.server.ts`, plus master-PIN gating and RLS-backed tables.

That is a **different product** from an inbound customer-support helpdesk. Nothing in the sales CRM will be removed, renamed, or rewritten.

## Assumption (correct me if wrong)

The support product is built as a **new set of pages and tables inside this same project**, reusing the existing sign-in, role resolution, AI gateway wiring, and design system. Support tickets are separate from sales leads; a support conversation is never a lead and vice versa. Support staff roles map onto the existing scopes: `authority` = support admin, `coordinator` = support lead, `agent` = support agent.

## New pages

| Route | Who | Purpose |
|---|---|---|
| `/support` | public customer | AI chat widget page: welcome state, history, composer, attachments, AI/human badges, "talk to a person", ticket created + status |
| `/support/ticket/$id` | customer (link/token) | Ticket status + thread |
| `/inbox` | agent, lead, admin | Unified conversation queue: filters (open/pending/resolved, priority, assignee, channel, unread), search, SLA countdown, customer panel, notes, tags, assign, status, canned replies, timeline |
| `/tickets` | agent+ | Ticket list + detail (id, category, priority, status, assignee, tags, linked conversation, history) |
| `/customers` | agent+ | Customer profiles: contacts, conversations, tickets, tags, notes, activity |
| `/kb` + `/kb/$slug` | public read | Knowledge base browse/search |
| `/kb-admin` | lead, admin | Article create/edit, draft vs published, categories, metadata |
| `/support-admin` | admin | Team + roles, business hours, escalation rules, AI settings, notification prefs, audit log |
| `/support-analytics` | lead, admin | Real metrics from the database |

Existing `/docs` + `/docs-admin` already hold internal documentation; the customer-facing KB is separate but reuses the same markdown editor/renderer components.

## Data model (new tables, all RLS + grants + indexes)

- `support_customers` — email, name, phone, tags, notes, first/last seen
- `support_conversations` — customer, channel, status (open/pending/resolved), priority, assignee, last_message_at, unread flags, first_response_at, resolved_at, ai_handled, escalated_at, sentiment, summary
- `support_messages` — conversation, author kind (`customer` | `ai` | `agent` | `system`), author id, body, attachments, ai metadata (model, confidence, cited article ids), created_at
- `support_tickets` — human-readable ref (`TKT-00001`), title, description, customer, conversation, category, priority, status, assignee, tags, timestamps
- `support_ticket_events` — append-only audit/history per ticket
- `support_notes` — internal notes on conversation/ticket/customer (never visible to customers)
- `support_articles` + `support_article_categories` — title, slug, body markdown, status draft/published, tags, author, published_at, search index
- `support_canned_replies`
- `support_settings` — business hours, escalation rules, AI settings (single row, admin-only writes)
- `support_csat` — rating + comment per resolved conversation (structure ready, prompt shown after resolve)

RLS: customers reach their own conversation only through a signed server function using a conversation token (no anon table access beyond published articles). Staff reads/writes go through `resolveCaller()`-backed server functions and role-scoped policies; agents see assigned + unassigned queues, leads/admins see everything. Internal notes are staff-only at the policy level, not just hidden in UI.

## AI support agent

New `src/lib/support-ai.server.ts` calling the existing Lovable AI gateway (server-side only, key already present as `LOVABLE_API_KEY`):

1. Retrieve candidate published articles (Postgres full-text search over title/body).
2. Grounded answer prompt: answer only from retrieved passages; if insufficient, say it cannot verify and offer a human.
3. Structured JSON out: `answer`, `cited_article_ids`, `confidence`, `intent`, `category`, `priority`, `sentiment`, `needs_human`.
4. Confidence/`needs_human` below threshold, or a customer asking for a person → conversation is escalated, ticket created, AI stops replying.
5. Every AI message stores model, confidence, and citations, so answers are auditable. Citations render as source links under the reply.
6. Agent-side helpers: conversation summary and suggested reply (agent must click send — nothing auto-sends).

No invented policies/prices/account facts: the prompt is retrieval-only and the schema forces citations.

## Analytics

Computed by a server function over real rows: conversation volume by day, AI-resolved vs human-handoff rate, median first response and resolution time, ticket volume by category/priority, CSAT average when ratings exist. Empty state says "no data yet" rather than showing invented numbers.

## Design

Premium light/dark SaaS helpdesk shell: dense three-pane inbox (queue / thread / customer context), sticky composer, distinct message treatments for customer vs AI vs agent, keyboard shortcuts (`j/k`, `e` resolve, `a` assign), skeleton loaders, real empty/error states, responsive collapse to single pane on mobile. Uses the project's existing tokens and shadcn components; new support-specific tokens added to `src/styles.css` rather than hardcoded colours.

Support UI copy: **English**, since this is a customer-support product for external customers, while the sales CRM stays Bengali. Say the word if you want it Bengali too.

## Sequencing

1. Migration: all tables, indexes, grants, RLS, settings row, KB categories.
2. Server layer: `support-*.server.ts` + `*.functions.ts` (auth-scoped), AI module, ticket ref generator, SLA/escalation logic.
3. Customer chat experience + KB read pages.
4. Agent inbox, tickets, customers.
5. KB admin, support admin/settings, analytics.
6. Verification: typecheck, build, vitest, RLS probe tests, Playwright pass over each new route incl. mobile viewport, dead-button sweep.

## Needs no new credential

AI runs on the existing Lovable AI key. Email notifications and non-web channels (email/WhatsApp ingest into the inbox) are the only parts that need an external provider — those ship as a clearly-marked adapter boundary with an "not configured" state instead of a fake integration.
