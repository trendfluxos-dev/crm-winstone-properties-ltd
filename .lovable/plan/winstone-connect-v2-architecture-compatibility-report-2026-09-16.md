# Winstone Connect V2 — Architecture & Compatibility Report

Read-only inspection. No code, data, accounts, or secrets were changed.

## A) Current V2 architecture

- React app on TanStack Start (file routes in `src/routes`, server functions in `src/lib/*.functions.ts`, server-only helpers in `*.server.ts`).
- Backend is a Lovable-managed database attached to this project. Schema is a full copy of production's (all tables, functions, triggers, policies present) but it holds **zero rows**: no accounts, staff records, leads, reports, or devices.
- Auth is a single real email+password source. Agents type a phone number or Employee ID; the server privately resolves it to the account email and performs a real sign-in. Accounts must be approved and active. Roles are mirrored into a separate roles table by a database trigger.
- Two PIN-gated surfaces exist: executive HQ (read-only) and IT console (full). Both are PIN-derived server tokens, not user accounts.
- Public API surface under `src/routes/api/public/*` covers agent login, call start/state, incoming call, presence, reports, WhatsApp, recording/lead/message/outcome ingestion, download, config, cron hooks.
- The Android app signs in at `/api/public/agent/login` and receives a per-device token stored only as a hash, then posts call/recording data to the same public routes.
- Twilio is fully absent from application code (src, routes, Android). Only one historical migration file and a roadmap line mention it.
- Migration history (`drizzle/migrations/` 0000–0038) is a record of what production already has — not a replay script.

## B) Production integration constraints

Two facts decide everything else:

1. **This project's backend cannot be repointed at the production database from code.** The connection is managed by the platform, not defined in editable source. The "use an outside backend" route is closed for projects already on the managed backend.
2. **The production project is not reachable from this workspace.** Cross-project access to it fails, so its code and data cannot be read or copied here.

Consequence: today, V2 has correct *structure* and no *live data*. Any screen built here would render an empty system.

## C) What must remain untouched

- Auth and identity resolution (phone/Employee ID → email → password sign-in), approval state, role mirroring.
- Access rules and row-level policies, PIN-gated HQ/IT surfaces.
- Lead ownership and assignment, call and report validation rules, follow-up rules.
- Recording ingestion, WhatsApp, AI features, offline queue and sync.
- Every public API route's request/response shape — the Android app depends on it byte-for-byte.
- The 38 applied migrations. Future needs become additive migrations only.
- Android call-recording monitoring/upload stays native. It is never re-implemented as web behaviour, simulated, or faked.
- The uploaded "Winstone Agent" prototype is a React demo with a simulated calling engine. It is used for visual reference only; none of its logic is reused.

## D) Safe migration path

Two honest options. This decision blocks all UI work.

**Option 1 — Build V2 inside the live project (recommended, no limits).**
Everything works unmodified: real agents, real data, admin duties, the phone app, ingestion. The V2 work becomes a UI-only layer over code that already runs. Nothing is copied, nothing is recreated.

**Option 2 — Bridge this project to the live backend (partial).**
You supply two safe-to-publish values from the live project: its backend web address and its public key. V2 screens then read and write live data as the signed-in agent, with all existing access rules enforced. Limits, stated plainly: anything needing elevated server-side rights — approving accounts, IT console duties, recording ingestion, the phone app's endpoints — stays on the live site, because that requires a private key that must not be copied. V2 becomes a new agent-facing front end; admin work continues on the current site.

Sequence, once chosen:
1. Confirm the option.
2. Verify a real agent sign-in and a real lead list render against live data.
3. Freeze the data model; treat migrations as history.
4. Begin the UI phase.
5. Leave the Android address constant alone until V2 is live on its final address; then one constant change and a new signed build.

## E) Recommended V2 UI architecture

Layer only — no new data paths, no new endpoints.

- Keep every existing route, server function, and data hook. New presentation components consume the same calls.
- One shared app shell: role-aware navigation, a single primary action per screen, no nested menus.
- Agent Dashboard: today's queue, due follow-ups, pending report gate, personal numbers — each a single scannable block, only from fields that already exist.
- Lead List / Queue: one dense-but-calm row per lead, owner and state legible at a glance, filters as one control group, works down to phone width.
- Lead 360: identity and next action pinned; history, calls, reports as calm sections rather than tabs-within-tabs.
- Follow-ups and call visibility reuse existing views with clearer grouping by time, not new aggregates.
- Performance summary shows only metrics the current data already supports. No invented metrics, no charts added for decoration.
- Visual direction: Palette A (navy, restrained emerald, cool white), all values as design tokens, no hardcoded colours. Minimal motion.

## F) Risks and blockers

- **Blocker:** connection architecture undecided. Building against the empty backend produces screens that look complete and show nothing real.
- **Risk (Option 2):** a split system — agents on V2, admins on the current site — is real operational overhead. Worth accepting only if the live project must stay untouched.
- **Risk:** any change to a public route's shape silently breaks installed Android builds. Those routes stay frozen during the UI phase.
- **Risk:** the empty local backend makes it easy to accidentally seed demo rows to "see" a screen. This will not be done.
- Note: 11 environment values and 3 document/drive connections from an earlier request are still unfinished; they are unrelated to the UI phase and not needed for it.

## Decision needed

Reply with **Option 1** (move the work into the live project) or **Option 2** (bridge — and send the live backend web address and public key). Redesign work stays on hold until then.
