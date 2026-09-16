# Winstone Connect V2 — read-only architecture audit and migration plan

Audit only. Nothing was changed: no data written, no accounts touched, no secrets read or rotated, no deployment.

## 1. Direct answer to the blocking question

**No — this V2 project cannot be pointed at the existing production database from code.**

- This V2 project runs on Lovable Cloud with its own managed backend (ref ending `...fkeht`). The connection is defined by managed environment values, not by editable source code. Editing them by hand does not move the project; it only breaks it.
- The "connect an external backend" path is not available to a project that already runs on Lovable Cloud.
- I verified the V2 backend is a **fresh, empty copy of the schema**: 0 user accounts, 0 staff profiles, 0 leads, 0 call reports, 0 devices. All tables, functions, triggers, and policies exist; no production rows were copied. So the 7 real agents cannot sign in here today, and no schema rerun against a new database is needed — the schema is already there.

**Therefore V2 must be built in one of two ways** (your decision required):

- **Option A (recommended, zero data risk): build V2 inside the existing production project** (`990267f3-…`), on the live backend the 7 agents already use. This V2 remix then becomes a throwaway design sandbox, or is discarded.
- **Option B: keep this remix as V2 and have Lovable support repoint/attach it to the production backend.** This is a support action, not something I or you can do from code or project settings. Until support confirms it, any "working login" here would be fake.

There is no third option that keeps real agent identity intact. Creating accounts here would be new, different accounts — explicitly out of scope per your rules.

## 2. Twilio status

Already fully removed from the application. A full-text scan of all source, server routes, and the Android app returned **zero Twilio references**. The only two hits anywhere:

- one old migration file `0016_ai_voice_sessions.sql` (historical record of an applied migration — must not be edited or re-run),
- one line in the Bengali roadmap noting Twilio was dropped.

The Twilio secrets (account SID, auth token, phone number, webhook base URL, recording consent notice) are **unused by code** and must not be copied into V2. Calling is SIM + Android app only.

## 3. Authentication and the 7-agent identity flow (no PII exposed)

- Single identity source: the backend's own auth (email + password). No demo, mock, fake token, or hardcoded account exists anywhere — the only "demo" hits in the codebase are a sample CSV for lead import and a cosmetic OTP input caret.
- Agents may type phone number or Employee ID; the server privately resolves it to the account email, then performs a real password sign-in.
- Every account carries an approval state; only approved, active accounts get a working desk. Role comes from the staff profile, mirrored into a separate roles table by a trigger.
- Two PIN-gated surfaces exist beside normal login: executive HQ (read-only) and IT console (full). These are PIN-derived server tokens, not user accounts.
- Android uses exactly the same contract: it posts the agent's own email/password to the shared login endpoint and receives a per-device token, stored only as a hash. No shared privileged secret ships in the APK.

## 4. What is tied to this remix backend vs. production

Tied to whichever backend the project runs on (all of it, automatically): auth, staff profiles, leads, calls, recordings, reports, follow-ups, devices, audit, support workspace, storage buckets (`call-audio`, `app-downloads`, `support-attachments`), scheduled sweeps, and all row-level access rules.

Not tied to a backend: the React app, all server functions and public API routes, the Android client.

**Android is currently hard-pinned to the production web address** (`webcrm.winstonebd.com`) in one constant. That means today's phones talk to production, not to this remix — a useful safety property, and the single switch point later.

## 5. Secrets

- Present and used by the running system: master PIN, IT console PIN, admin token signing secret, ingest secret, shift cron secret, AI key, cron secret, and the backend's own managed keys.
- Present but unused: the five Twilio values and an AWS access key id. These should not be carried into V2.
- No secret value was read, printed, rotated, or deleted during this audit.

## 6. Proposed execution order

1. **You choose Option A or Option B above.** Everything else waits on this — it is the only decision that determines whether real agents can ever sign in to V2.
2. If Option B: you contact Lovable support to attach this project to the production backend; I do nothing meanwhile.
3. Once V2 runs on the production backend, freeze the data model. Treat the 38 applied migrations as history: never re-run, never recreate. Any V2 need becomes a new additive migration only.
4. Remove the five unused Twilio secrets and the unused AWS key from the V2 environment (your call, non-urgent; they are inert).
5. Build V2 as a UI/UX layer only: dashboard, lead list, navigation, readability, mobile. No change to auth, roles, access rules, lead ownership, call/report logic, recording ingestion, WhatsApp, AI, or sync queues.
6. Keep the Android contract byte-identical. Only when V2 is live on its final address does the single address constant change, followed by a new signed APK.
7. Verification before release: real agent sign-in on the real backend, one real call → report → recording → transcript path, and the existing automated test suite.

## Technical notes

- Backend verification query used: row counts across accounts, profiles, leads, reports, and devices on the V2 backend — all zero.
- Migration history lives in `drizzle/migrations/` (0000–0038, plus meta). It is a record of what production already has; it is not a script to replay.
- Android server address constant: `WinstoneApi.BASE_URL`.
- Login endpoint shared by web and Android: `/api/public/agent/login`.
