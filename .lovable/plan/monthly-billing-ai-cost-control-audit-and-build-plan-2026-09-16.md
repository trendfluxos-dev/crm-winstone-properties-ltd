# Monthly billing & AI cost control — audit and build plan

Window audited: 17 Aug 2026 – 16 Sep 2026 (Dhaka, UTC+6) = `2026-08-16T18:00Z` to `2026-09-16T18:00Z`.

## 1. What the 31 days actually show

Nothing was spent, because nothing ran.

| Measure | Value | Source |
|---|---|---|
| Usage ledger rows in window | 0 | `ai_usage_events` |
| Ledger rows all-time | 0 | `ai_usage_events` |
| Credits recorded in window | 0 | `ai_usage_events.est_credits` |
| AI provider calls in window | 0 of 0 | AI gateway request log |
| Call recordings / call reports | 0 / 0 | `call_recordings`, `call_reports` |
| Paid subscriptions | 0 | `subscriptions` |

So: no category breakdown, no model/provider breakdown, no daily trend, and no run-rate can be computed. Any number presented as a trend today would be invented. This backend has never carried live traffic.

## 2. The two numbers you asked about

- **525 / 650 credits** — hard-coded in `src/lib/credits-report.functions.ts` line 149 (`projection: { aiOnly: 525, withDevelopment: 650 }`). It is a fixed literal returned to the credits page regardless of usage. It is not a projection derived from data.
- **Flat rates** — `src/lib/ai-usage.server.ts` lines 13–19 and a duplicated client copy in `src/lib/credits-rates.ts`: command_agent 0.25, transcription 0.02, analysis 0.03, doc_summary 0.03, other 0.01. These are per-call constants, not per-token or per-second costs, so a 30-second call and a 30-minute call bill identically. The duplication means the two files can drift apart silently.

## 3. What is metered vs. not

Only 5 call sites write to the ledger — `call-intel.server.ts`, `command-agent.server.ts`, `support-ai.server.ts`.

Unmetered AI/provider paths (call the AI gateway or Sarvam speech API, write no usage row):

`hq-ask.server.ts`, `copilot.server.ts`, `coach.server.ts`, `precall.server.ts`, `doc-summary.functions.ts`, `report-summary.functions.ts`, `lead-import.functions.ts`, `transcribe.functions.ts`, `stt-provider.server.ts`, `sarvam-stt.server.ts`.

Other cost sources with no cost record at all: Google Drive/Docs backup (`gdrive.server.ts`, `recording-doc.server.ts`), WhatsApp sending, audio storage growth, and the scheduled jobs under `src/routes/api/public/hooks/` (shift summary, lead distribution, drive backup) plus ingest analysis.

Ledger reliability gaps: writes are best-effort inside try/catch, so a failed insert is swallowed; there is no idempotency key, so a retried job double-counts; `ai_usage_events` has no cost-in-money column, no provider column, and no token/second counts.

## 4. Can it support a smooth recurring monthly bill today?

No. Payment collection exists (Paddle webhook + `subscriptions`), but the cost side cannot produce a defensible invoice: most spend is invisible, rates are flat guesses, totals are recomputed live from raw rows with no frozen snapshot, and there are no caps or alerts. A customer bill built on this could not be reproduced or audited a month later.

## 5. Build plan

**A. Complete the meter.** One `recordUsage()` helper wrapping every AI and provider call; add the 10 unmetered paths above. Record provider, model, operation, input/output tokens or audio seconds, latency, success/failure, and an idempotency key so retries collapse into one row.

**B. Real cost, not flat guesses.** A `provider_rate_cards` table (provider, model, unit, unit cost, currency, effective_from/to). Cost is computed at write time from the rate card in force and stored on the row, so historical rows never change when prices change. Retire the duplicated flat-rate constants; the credits page reads current rates from the table.

**C. Money, not only credits.** Store cost in credits and in currency, and add non-AI cost lines: storage GB, WhatsApp messages, Drive operations.

**D. Budgets, caps, alerts.** Monthly budget per workspace and optional per-agent cap. Soft threshold alerts at 50/80/100 percent into `system_alerts`; hard cap blocks discretionary AI (copilot, coach, HQ ask) while never blocking the call-report path — the report lock stays absolute.

**E. Invoice snapshots.** At each Dhaka month boundary, a scheduled job freezes an immutable `billing_invoices` row plus `billing_invoice_lines` (totals by provider, model, category, agent) with a generation hash. Re-running the job is idempotent and never rewrites a closed month.

**F. Dhaka boundaries everywhere.** One shared month/day boundary helper (00:00 Dhaka = 18:00 UTC previous day) used by the meter, the report, the snapshot job, and the caps — replacing the inline offset arithmetic now duplicated in `credits-report.functions.ts`.

**G. Auditability.** Every rate-card change, budget change, cap trigger, and invoice close writes to `audit_logs`. All new tables get RLS with admin-only reads and service-role writes.

**H. Replace the fake projection.** Remove the 525/650 literal. Show measured month-to-date, a run-rate projection computed from actual daily spend, and an explicit "no data yet" state when the ledger is empty instead of a fabricated figure.

## 6. Technical notes

- New tables: `provider_rate_cards`, `billing_budgets`, `billing_invoices`, `billing_invoice_lines`. Extend `ai_usage_events` with `provider`, `operation`, `input_units`, `output_units`, `unit_kind`, `cost_credits`, `cost_amount`, `currency`, `rate_card_id`, `idempotency_key` (unique), `status`.
- Grants and RLS on every new public table; service_role for job writes, admin-only select.
- Month-close job as a public hook route guarded by the existing cron secret pattern used in `src/routes/api/public/hooks/`.
- No change to call/report/recording logic, lead ownership, auth, the Android endpoint, or the Paddle contract.

## Assumption

Billing is internal cost control for Winstone (one organisation), not per-customer resale invoicing. If you actually need to invoice external customers, say so — that adds customer accounts, tax handling, and payment reconciliation.
