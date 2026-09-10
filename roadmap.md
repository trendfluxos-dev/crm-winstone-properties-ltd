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

## Queued
- [ ] Android: build APK with WinstoneApi.kt + LiveCallLauncher.kt + WinstoneRules.kt wired in;
      place at public/downloads/winstone-connect.apk
- [ ] Install APK on a real phone, place a live call, confirm recording + WhatsApp log land in the
      agent workspace (needs the physical handset — cannot be done from this environment)
