# Winstone CRM → Twilio communications + AI platform

## What already exists (audit)

**Calling**
- Android Winstone Connect: SIM call, call-state detection, native recording attempt, offline queue, upload to storage, mandatory post-call report. Works today — untouched by this plan.
- Twilio cloud voice already scaffolded: outbound call creation, agent-bridge TwiML, inbound voice TwiML, call-status webhook, recording-download webhook, health card in IT Console, "Twilio কল" button on each lead.
- Every call row is tagged with its source, so Twilio calls and phone calls never collide.

**Recordings / AI**
- Private recording storage with signed access only, checksums, duplicate protection, job queue (upload → transcription → analysis).
- Speech-to-text is provider-agnostic (Google primary, OpenAI fallback, Sarvam disabled because it blocks Bangladesh traffic).
- AI produces summary, intent, objection, follow-up, lead category; report sheet sync into the single connected Google Sheet.

**Messaging**
- WhatsApp: official Meta path is written but honestly reports "not configured"; day-to-day use is the wa.me hand-off. A Twilio WhatsApp webhook exists and stores inbound messages.
- No SMS anywhere yet.

**Data / access**
- Leads, staff profiles, roles, assignments, lead events, calls, reports, follow-ups, devices, audit log, processing jobs, sync events — all row-level protected: agents see only their own work, management by role.
- Login is phone number + password only. Unlock PIN for HQ / IT Console.

## Gaps and conflicts

1. **No Twilio phone number purchased yet** — outbound/inbound Twilio calling cannot be live until a number exists and the webhook URLs are set. Nothing will be shown as "connected" until it truly is.
2. **No live AI voice** — ConversationRelay (Twilio streaming a call to an AI agent) needs a persistent socket endpoint; the current server has none.
3. **No SMS**, no message templates, no opt-out handling.
4. **Two WhatsApp paths** (Meta stub + Twilio webhook) — must be reduced to one selectable provider, or inbound messages get double-counted.
5. **No customer memory** across channels: call, WhatsApp and SMS history exist per lead but are not merged into one conversation timeline an AI can read.
6. **No orchestrator** deciding which channel/agent/AI handles an incoming contact, and no clean human-handoff switch.
7. **Consent**: recording notice text exists, but there is no per-customer consent record or do-not-contact list.
8. **Observability**: audit log exists, but no single place showing delivery status, webhook failures and retry state.
9. **Recording ownership** — Twilio recordings and phone recordings land in the same place with different shapes; the report and sheet views need one unified read.

## Proposed phases

**Phase 1 — Make Twilio real and safe**
Number and credential management screen in IT Console: buy/attach a Twilio number, show which webhooks are set and verified, live health from Twilio itself. Signature verification on every webhook. Retry + duplicate protection on call status and recording callbacks. Consent record per customer plus a do-not-contact list that blocks dialling and messaging.

**Phase 2 — Voice end to end**
Outbound: agent presses call, their phone rings, customer is dialled, recording (if consented), status trail, recording stored, transcript + AI analysis queued, mandatory report unlocked. Inbound: caller matched to an existing lead or a new lead created for whoever answers. Unified call timeline per lead covering both phone-app and Twilio calls with total talk time.

**Phase 3 — SMS and WhatsApp on one provider**
One messaging provider setting (Twilio or Meta), never both live at once. Send/receive with true delivery state — queued, sent, delivered, read, failed with the provider's own reason. Template library, opt-out keyword handling, per-lead thread in the CRM.

**Phase 4 — Customer memory and Conversation Intelligence**
One merged conversation memory per customer across calls, SMS and WhatsApp, with a rolling AI profile (interest, objections, promised follow-ups, sentiment trend). Conversation Intelligence: quality scoring, talk/listen ratio, objection tagging, coaching notes for team leads.

**Phase 5 — Conversation Orchestrator + human handoff**
Rules deciding who handles an incoming contact: assigned agent first, then shift roster, then queue. Explicit handoff button moving a live conversation from AI to a person with full context, and back. Escalation alerts to Coordinator Deck and HQ.

**Phase 6 — AI voice (ConversationRelay)**
Live AI voice answering, in Bengali, for overflow and after-hours calls: greeting, qualification, appointment capture, then transfer to a human. Kept last because it needs a streaming socket service and a streaming speech provider — a separate infrastructure decision I will bring to you before building.

**Phase 7 — Operations console**
One communications dashboard: every call and message with its true status, failed webhooks and retry state, per-number usage and cost, AI job queue health, and audit of who did what.

## Technical notes

- Twilio access stays server-side through the existing connector gateway; no credential ever reaches the browser.
- New tables (proposed): `communication_events` (unified channel timeline), `customer_memory`, `consent_records`, `do_not_contact`, `messaging_templates`, `webhook_deliveries`. Existing call/recording/report tables are extended, not replaced.
- Every webhook stays idempotent on the provider's own event id; retries are recorded, not silently swallowed.
- Row-level protection follows the current model exactly: agents see only their own leads and conversations.
- Android app contract is unchanged — its lifecycle, recording and report logic keeps working as is.
- Nothing is ever displayed as connected, delivered or recorded unless the provider confirmed it.
