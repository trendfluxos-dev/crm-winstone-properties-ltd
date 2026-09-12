# Roadmap

## Done
- [x] Theme: white / green / cream palette across the web CRM (+ colors.xml for Android)
- [x] Lead privacy: agents only ever receive their own leads and logs; authority PIN sees the floor
- [x] Custom Reports screen (/reports): charts, filters, CSV export, + /api/public/reports/summary
- [x] IT customizer (/system → Customizer): extra lead fields, floor rules, agent permissions
      + /api/public/config/rules so the phone app reads the live rules (WinstoneRules.kt)
- [x] AI Coach screen (/coach): per-agent summary, strengths, risks and next steps from real
      call transcripts + WhatsApp logs, + /api/public/agent/coach for the phone app
- [x] Ingest validation screen (/ingest): pipe health, data problems, payload tester

- [x] Android live call screen (LiveCallScreen.kt): in-call timer, REC chip, live notes,
      mute/speaker, End call, outcome sheet -> presence + recording + outcome endpoints
- [x] /api/public/agent/presence (live on-call radar) and /api/public/ingest/outcome

- [x] Agent integrations (MCP) at /mcp: sign-in required (Google + consent page), email allow-list in
      IT Console → Customizer; tools list_agents, list_leads, lead_history, floor_summary, create_lead

- [x] Entry hall home (/) with four doors: Sales Agent, Coordinator Deck, Executive HQ, IT Console
- [x] Agent + coordinator accounts (/auth, /desk) with approval-before-access, editable own profile
- [x] Coordinator Deck owns lead assignment, balancing, CSV import and the full Agent Queue
- [x] Executive HQ is read-only + Ask HQ panel (natural-language answers with charts)
- [x] IT Console approves / rejects new accounts and keeps system configuration

## Queued
- [x] Android agent app: real Gradle project at android/ (Compose desk mirroring /desk: stats,
      lead queue, call log, WhatsApp inbox, AI coach, new-lead form), SIM call + call recording,
      WorkManager upload queue; APK built and served from the web CRM download button
- [ ] Install APK on a real phone, place a live call, confirm recording + WhatsApp log land in the
      agent workspace (needs the physical handset — cannot be done from this environment)
---ADD---

## Open tasks
- [ ] Verify Android app wiring end to end (call, WhatsApp, lead, AI Copilot)
- [x] Bengali UI for Executive HQ + IT Console
- [x] Agent dashboard (/desk): own stats, lead queue, call log, WhatsApp inbox, submit new lead
- [x] Android app signs in with CRM email + password (/api/public/agent/login) — no employee id typing
- [x] Agents self-assign: open (unassigned) leads list on /desk with one-tap claim, web only
- [x] Real call-recording backend: multipart audio upload, storage + transcription + AI audit, retry endpoint (/api/public/ingest/reprocess) — verified end to end with real speech
- [x] Per-device auth for the phone app (agent_devices + x-device-token); shared ingest secret removed from the APK
- [x] Mandatory post-call report gate: 8 categories, conditional fields, DB-enforced next-call lock (verified with a live DB rule test)
- [x] Follow-up calendar (day/week/month/agenda) + follow_up_events
- [x] Report/recording/AI/device/alert panel on Executive HQ + IT Console; assignment history on Coordinator Deck
- [x] Documentation CMS: /docs, /docs/:slug, /docs-admin, /docs-admin/editor/:slug (real persistence, draft→published)
- [x] APK v1.4 (versionCode 5) built, uploaded, and registered in app_releases for in-app update notice
- [ ] Physical handset run: install v1.4, place a live call, confirm report + recording + AI land in HQ (needs the phone)
- [ ] Official Meta WhatsApp Business API: needs a business account + credentials before delivery can be claimed
- [x] Desk tab "আমার রিপোর্ট": own call reports + upcoming/overdue follow-up work (web + phone data)
- [x] Official Meta WhatsApp Cloud API send + webhook receive implemented (activates when credentials are saved)
- [ ] Re-verify recording → stored audio → transcription → AI summary with retry/error states (in progress)
