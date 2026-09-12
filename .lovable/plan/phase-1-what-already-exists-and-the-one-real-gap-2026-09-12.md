# Phase 1 — what already exists, and the one real gap

I inspected the project before planning. Almost all of your Phase 1 list is already built and working here, so this is not a rebuild. Below is the honest map, then the small amount of missing work I will actually do.

## Already built (no change needed)

- Sign-in with one account for web and phone, approval-before-access, roles: agent, coordinator, executive, IT.
- Role separation enforced on the server and in the database, not just by hiding pages.
- Lead list, manual add lead, duplicate check, Bangladesh number normalisation, address / serial / reference fields.
- Lead import from CSV, Excel, Word, PDF, text and photos with a review step before saving.
- Coordinator assignment: single, bulk, reassign, workload balance, and a full assignment history trail.
- Call action beside every lead, call logging, and the mandatory post-call report with the 8 categories and conditional fields, locked so a new call cannot start while a report is unfinished.
- Follow-up queue and calendar with due / overdue / upcoming, reminders and notifications.
- Executive HQ: KPIs, agent leaderboard, funnel, activity timeline, filters.
- IT Console: users, devices, system health, integration status, notifications, configuration.
- Recording, transcript and AI analysis are already live (not just prepared), with durable pending / processing / completed / failed states, retry, and Bangla output.

## The real gap: a protected audit history

Your acceptance criteria 11 and 12 ask for audit events and protected audit history. Today the system logs a per-lead activity trail, but there is no organisation-wide audit record of who approved an account, changed a role, assigned a lead, submitted a report, or registered a phone.

### What I will add

1. A new audit history store that keeps: who did it, what action, which record, extra details, and the exact time. Only IT and executive accounts can read it; nobody can edit or delete entries, including IT.
2. Audit entries written automatically for: sign-in approval / rejection, role change, lead created, lead assigned or reassigned, call report submitted, phone device registered, and recording reprocess requests.
3. A "Recent audit events" panel in IT Console with search by person and action, newest first, paginated.

### Technical notes

- New table `public.audit_logs` (actor, action, entity_type, entity_id, metadata jsonb, created_at) in an additive migration, with GRANTs, RLS allowing SELECT to admin/team_leader roles via `has_role`, INSERT only through the service-role server path, and no UPDATE/DELETE policy.
- A best-effort `logAudit()` helper in `src/lib/audit.server.ts` following the existing `lead-events.server.ts` pattern; a logging failure never breaks the action.
- Call sites: `accounts.functions.ts` (decide/role), `crm.functions.ts` (assign, import, reanalyze), `lead-intake.server.ts`, `call-reports.server.ts`, `device-auth.server.ts`.
- A paginated read server function plus an `AuditTrail` component mounted in `src/routes/system.tsx`.
- Regenerate database types, then run typecheck and production build.

## Not in scope here

Sinch/cloud telephony stays out, per your own scope control. Official Meta WhatsApp still needs your business credentials before delivery can be claimed. Physical handset call verification still needs your phone.
