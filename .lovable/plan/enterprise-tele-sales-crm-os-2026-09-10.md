# Enterprise Tele-Sales CRM OS

A command-center web app for a phone sales team: live agent tracking, a lead queue, and a per-lead dossier merging calls and WhatsApp chats, with AI call summaries.

## What gets built

**Backend (Lovable Cloud)**
Four tables — team members, leads, call recordings, WhatsApp messages — with live updates pushed to every open screen, plus a storage bucket for call audio. Seeded from the start with 4 agents, ~24 leads across all pipeline stages, demo call recordings with audio, transcripts, summaries and sentiment, and WhatsApp threads including voice notes.

**Executive HQ dashboard (home page)**
- Live Agent Radar: one card per agent with status (On Call = pulsing green, Idle = amber, Offline = gray), current/last call duration, last active time.
- Daily leaderboard: total dials, connected calls (over 10s), total talk time, WhatsApp touchpoints, conversion rate, synced audio count.
- Lead Balancer: "Auto Distribute Leads" splits unassigned leads evenly across active agents in one click.

**Smart Lead Queue**
- Pipeline columns: Pending, Contacted, Follow-up, Closed.
- Green verified badge with a one-line talk summary on leads with a verified call.
- Retry counter on unanswered leads.
- Quick actions per lead: Direct Dial (opens the phone dialer) and WhatsApp Chat (opens WhatsApp).

**Call Dossier drawer**
- Slides out from any lead; calls and WhatsApp messages merged into one chronological timeline.
- Custom audio player: play/pause, 1x–2x speed, ±5s skip, waveform scrubber.
- AI panel: 3-bullet summary, sentiment tag, objections list, transcript where clicking a line jumps the audio to that moment.
- Audio badge: "Two-Sided Audio Verified" or "One-Sided / Review Needed".

**Ingestion**
- A secure upload endpoint the native Android app can post recordings and chat messages to; new records appear instantly in the dashboard and dossier via live updates.
- Admin override modal in the app to upload a recording or log a message manually, for testing.
- Uploaded audio is transcribed and summarised by AI (summary, sentiment, objections) automatically after upload.

Logins/roles are intentionally left out for now — every screen is open. The app is built so roles can be layered on later.

## Technical notes

- Tables: `profiles`, `leads`, `call_recordings`, `whatsapp_interactions` with the columns and enums from the brief; grants + RLS enabled with permissive anon policies for this pre-auth phase (tightened when auth lands). Realtime enabled on the three activity tables; migration includes literal seed INSERTs.
- Private `call-audio` storage bucket; signed URLs served through a server function.
- Ingestion via `src/routes/api/public/ingest/*` server routes with a shared-secret header check, validated with Zod.
- Transcription: Lovable AI `google/gemini-3.5-transcribe`; summary/sentiment/objections: `openai/gpt-6-astra` on the Responses API with a strict JSON schema, streamed and consumed server-side.
- Reads/writes through `createServerFn` in `*.functions.ts`; TanStack Query for caching; Supabase realtime subscriptions invalidate queries.
- Dashboard, queue, and dossier are routes `/`, `/leads`, with the dossier as a drawer over the queue; each route gets its own `head()` metadata.
- Dark, high-density operations-console theme via semantic tokens in `src/styles.css`.
