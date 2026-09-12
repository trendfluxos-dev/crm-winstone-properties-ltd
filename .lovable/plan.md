# Winstone CRM — Production Readiness Audit & Plan

No files were changed in this turn. Findings below come from reading the routes, `src/lib`, the migration folder, the Android sources and manifest, and the notice/realtime code.

## 1. Current architecture

- **Web (TanStack Start)** — entry hall `/`, `/auth`, agent `/desk`, coordinator `/dispatch`, `/hq`, `/system` (IT Console), plus `/reports`, `/coach`, `/ingest`, `/mcp`, legal pages. Business logic lives in `src/lib/*.functions.ts` (server functions) and `*.server.ts` helpers.
- **Database (Lovable Cloud)** — `profiles`, `user_roles` + `has_role()`, `leads`, `call_recordings`, `lead_events`, `whatsapp_interactions`, `app_config`, `system_settings`, `subscriptions`. RLS is on everywhere with role-based policies; `call-audio` and `app-downloads` buckets are private and served through signed URLs.
- **Phone ingest** — public routes `api/public/ingest/{recording,lead,message,outcome,reprocess}`, `agent/{login,workspace,presence,coach}`, `config/rules`, `download/apk`, `reports/summary`, `paddle/webhook`. All are guarded by one shared `INGEST_SECRET` header compared in constant time.
- **AI call intelligence** — `call-intel.server.ts`: Gemini transcription, then a strict-schema GPT analysis producing summary, sentiment, objections, deal stage and a timestamped transcript, written back to `call_recordings`.
- **Android app** (`android/`) — Compose desk mirroring `/desk`, CRM email/password login, `LiveCallLauncher` (normal SIM dial + WhatsApp deep link), `CallStateReceiver`, `CallRecorder` (VOICE_COMMUNICATION with MIC fallback), `CallSyncQueue`/`CrmSyncWorker` (WorkManager, unique work, exponential backoff), `WinstoneApi` with the ingest secret compiled in via BuildConfig.
- **Realtime/notifications** — `crm-data.ts` per-consumer realtime channels plus a 10s poll fallback; `notices.server.ts` produces Bengali system notices surfaced in `/system` and `/hq` with entry popups.

## 2. What already works

- Role-gated accounts with pre-approved roster, IT Console approval for everyone else.
- Real persistence end to end: leads, calls, WhatsApp logs, outcomes, presence and the lead timeline all read/write real tables — no mock data in business paths.
- Coordinator assignment, agent self-claim, agent-created leads assigned directly to the creator (`assignment_source: "self"`), self-claim events visible in Coordinator/HQ.
- Recording upload as multipart or base64 JSON, storage write, transcription + AI audit, `lead_events` lifecycle (`call_connected`, `recording_saved`, `transcript_ready`, `transcript_failed`), plus a manual reprocess endpoint. Verified once with real speech audio.
- HQ read-only dashboards, Ask HQ, custom reports with CSV export, AI coach, ingest health screen, MCP with OAuth.

## 3. Gaps (ordered by production risk)

1. **One shared secret authenticates every phone.** `INGEST_SECRET` is compiled into the APK (`BuildConfig`) and is trivially extractable from a distributed file. Anyone with it can post recordings/leads/outcomes and read any agent's workspace by `employee_id`. This is the single biggest production hole.
2. **No foreground service in the manifest.** `FOREGROUND_SERVICE_MICROPHONE` is requested but no `<service>` is declared and recording runs in the app process. On Android 12+ mic capture from a backgrounded app can be cut, so long calls can silently produce short or empty files.
3. **`CAPTURE_AUDIO_OUTPUT` is a privileged permission** that a sideloaded app never receives; it cannot deliver two-sided audio and only makes the manifest look stronger than it is.
4. **Two-sided recording is not guaranteeable.** VOICE_COMMUNICATION → MIC fallback is correct, but on many OEMs (Xiaomi/Samsung/Oppo, Android 10+) only the agent side is captured. `is_two_sided=false` is honest but the UI/HQ does not yet warn per device.
5. **Transcription runs inside the upload request.** The whole file is base64-buffered in the worker (24 MB cap) and transcription is awaited before responding — long calls risk request timeouts and duplicate work on WorkManager retry. There is no idempotency key, so a retried upload can create a second recording row.
6. **Failed analysis has no automatic retry.** `sync_status`/`transcript_failed` requires a human to press reprocess; no attempt counter, no last-error text, no scheduled sweep.
7. **Inbound WhatsApp is invisible.** Only messages the agent sends from inside the app are logged. Customer replies and messages sent in the WhatsApp app itself never reach the CRM — that needs WhatsApp Business Cloud API (Meta account, verified number, webhook), which does not exist yet.
8. **APK distribution has no update path.** Signing key was regenerated once (forcing uninstall), and the app has no version check against the server, so agents can silently run stale builds.
9. **Billing is a 7-day internal trial row.** Paddle webhook code exists but no live credentials/price IDs; when the trial lapses the notice bar warns and nothing enforces or renews.
10. **No end-to-end verification on a real handset** — call, recording, WhatsApp and lead have never been walked through on a physical phone.
11. **No server-side alerting.** Failures surface only when someone opens `/system` or `/hq`; there is no email/push on ingest failure.

## 4. Proposed database changes (only where missing)

All additive; no drops, renames or type changes.

- `agent_devices` — per-device auth: `id`, `profile_id`, `token_hash`, `device_label`, `platform`, `app_version`, `last_seen_at`, `revoked_at`. Replaces the shared secret for phone calls (secret kept only for server-to-server/testing during migration).
- `call_recordings`: add nullable `client_upload_id` (unique) for idempotency, `analysis_status`, `analysis_attempts` (default 0), `analysis_error`, `recorder_source` ('voice_call' | 'mic'), `device_id`.
- `app_releases` — `version_code`, `version_name`, `storage_path`, `is_mandatory`, `released_at`, so the app can check for updates.
- `system_alerts` (optional, Phase 5) — persisted notice history with `acknowledged_at`, so failures are not lost between page loads.
- Grants + RLS on each new table in the same migration (`authenticated` scoped by `has_role`/ownership, `service_role` full, no `anon`).

## 5. Implementation phases

**Phase 1 — Security & ingest integrity (blocker)**
Per-device tokens issued at login and stored hashed; every phone endpoint authenticated by device token bound to a profile; `employee_id` no longer authorizes a workspace read; rotate `INGEST_SECRET`; add `client_upload_id` idempotency; rate-limit public routes.

**Phase 2 — Recording reliability on the device**
Declare a `mediaProjection`-free microphone foreground service with a persistent Bengali notification for the whole call; drop `CAPTURE_AUDIO_OUTPUT`; verify file size/duration before queueing; keep indefinite retry for recording uploads; record `recorder_source` and surface a one-time "এই ফোনে দুই পক্ষের অডিও পাওয়া যাচ্ছে না" warning to agent, Coordinator and HQ.

**Phase 3 — Durable analysis pipeline**
Upload responds as soon as audio is stored; transcription/analysis moves to a status-tracked job with attempt counter, error text and a scheduled sweep endpoint (cron) that retries failures with backoff; `/ingest` screen shows the queue instead of ad-hoc reprocess.

**Phase 4 — App lifecycle & operations**
`app_releases` + in-app version check with update prompt; APK download served with correct MIME (already working) and version metadata; stable signing key documented for future updates.

**Phase 5 — Visibility & alerting**
Persist notices, add acknowledge, and send an email/notification to IT Console when a critical notice appears (failed uploads, missing audio, expired billing).

**Phase 6 — Optional WhatsApp two-way**
Only if you supply a Meta WhatsApp Business account: webhook route + template messaging, writing inbound customer messages into `whatsapp_interactions`. Skipped otherwise; current agent-side logging stays.

## 6. Verification strategy

- Server: real ingest calls with real speech audio for each endpoint, asserting rows in `call_recordings`, `leads`, `lead_events`, `whatsapp_interactions`; unauthorized/replayed/oversized requests must be rejected; duplicate `client_upload_id` must not create a second row.
- Web: authenticated browser runs as agent, coordinator, HQ and IT roles confirming the same call appears in all three views without manual refresh, and console stays clean.
- Android: release build + install on your handset, then a scripted checklist — login, dial, in-call screen with REC state, hang up, airplane-mode-then-reconnect to prove queued upload survives, WhatsApp message, new lead, and the four lifecycle events appearing in HQ.
- Regression: TypeScript check plus Android release build on every phase.

## 7. Production blockers & handover items

Cannot be guaranteed from this environment or without external input:

1. **Two-sided call recording** — device/OEM/carrier dependent; no Android API guarantees it on a sideloaded app. We record what the device allows and label it truthfully.
2. **Physical handset testing** — only you can install and place real calls; every device-side claim stays unverified until then.
3. **Battery/OEM restrictions** — Xiaomi/Oppo/Vivo power savers can kill background work; agents must set the app to "unrestricted" battery and autostart.
4. **Inbound WhatsApp** — needs a Meta WhatsApp Business account, verified sender number and approved templates (your credentials, monthly cost).
5. **Live billing** — Paddle live vendor/price IDs and keys are yours to provide; the current trial row expires.
6. **APK distribution** — no Play Store listing; sideloading requires "Install unknown apps", and the release keystore must be preserved from now on for in-place updates.
7. **Legal** — Bangladesh call-recording consent notice/announcement is a policy decision you must confirm before wide rollout.

Recommended order if you want the shortest path to genuinely production-safe: Phase 1 → Phase 2 → Phase 3, then real-handset verification, then 4–5.
