# Roadmap

## In progress
- [ ] Theme upgrade: "Hyper-Smart Modern Enterprise" (light slate, indigo/emerald/amber, glass nav, skeletons, radar glow, zebra tables, dark waveform)

## Queued
- [ ] Android: build APK with WinstoneApi.kt + LiveCallLauncher.kt wired in; place at public/downloads/winstone-connect.apk
- [ ] Android: end-to-end live call test against webcrm.winstonebd.com (needs a real phone — user)
- [ ] Ingest validation on /api/public/ingest/lead (E.164 BD phone, HTML strip, 400/422 errors, enum defaults)
- [x] Custom Reports screen (/reports): charts, date/agent/source/stage filters, CSV export, + /api/public/reports/summary wired for Android (WinstoneReports.kt)
- [ ] IT console: system customizer (carrier rate, ingest key manager, retention, feature flags)
- [ ] Agent workspace: AI sales guidance drawer + personal status / dialer preference
- [ ] Wire the above into the Android app
- [ ] Install APK on a real phone, place a live call, confirm recording + WhatsApp log land in the agent workspace (needs the physical handset — cannot be done from this environment)
