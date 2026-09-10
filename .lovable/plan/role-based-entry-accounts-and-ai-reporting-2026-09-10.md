# Role-based entry, accounts and AI reporting

## What the app will look like

**Home page becomes a single entry hall.** Four cards, one per role:

```text
+------------------+------------------+------------------+------------------+
|  Sales Agent     | Coordinator Deck |  Executive HQ    |   IT Console     |
|  log in /        | log in /         |  unlock PIN      |   unlock PIN     |
|  create account  | create account   |                  |                  |
+------------------+------------------+------------------+------------------+
```

- **Agent** and **Coordinator**: email + password sign-in, plus "Create account".
  A new account waits for approval — until IT Console or Executive HQ approves it,
  the person sees a friendly "waiting for approval" screen.
- **Executive HQ** and **IT Console**: unlock PIN as today (`142164448@` / `142164@`).

**Agent (after sign-in)** sees only their own queue: their leads, their calls,
their WhatsApp logs, their own AI coach, their own reports, and their editable
profile (name, phone, avatar colour). Nothing from other agents.

**Coordinator Deck** becomes the lead-assignment home: bulk push, balance all,
CSV import, team load table, **and the full Agent Queue** (every agent's leads
with per-agent filter). Coordinators approve nothing and see no billing.

**Executive HQ** becomes read-and-ask: floor radar, leaderboard, metrics,
reports, agent queue (read-only), and a new **Ask HQ** panel — a chat where an
instruction like "এই মাসে কে সবচেয়ে বেশি deal করেছে, chart দাও" produces a live
chart/table/report on the spot. It can also act (assign leads, change floor
rules) when asked. Lead-assignment controls are removed from HQ's own UI.

**IT Console** keeps system configuration (fields, rules, permissions, billing,
integrations) and gains **Account approvals**: pending sign-ups listed with
Approve as agent / Approve as coordinator / Reject.

**Reports** stay a shared screen, scoped by who opens it: agent sees own,
coordinator/HQ/IT see the whole floor. Auto-generated daily summary appears at
the top of the reports screen for every role.

## Technical approach

### Accounts and roles
- Email/password auth with signup confirmation left as-is; signups are gated by
  an `approval_status` (`pending` / `approved` / `rejected`) column added to
  `profiles`, plus a `user_id` link filled on first sign-in.
- Migration: add `approval_status`, `requested_role`, index; keep the existing
  `profiles_sync_role` trigger. Add owner-side SELECT policy so a pending user
  can read their own profile row and see the waiting screen.
- New `src/routes/auth.tsx` (public): sign-in / create-account tabs with
  `role` search param (`agent` | `coordinator`). New `src/routes/pending.tsx`
  waiting screen.
- Session-aware routing: signed-in approved agent lands on `/queue`;
  coordinator lands on `/dispatch`.
- Root `onAuthStateChange` subscriber added in `__root.tsx` for router
  invalidation.

### Access model (two mechanisms, one resolver)
- `src/lib/access.server.ts`: resolves a caller into
  `{ scope: "agent" | "coordinator" | "authority", profileId }` from either
  a Supabase bearer session (agent/coordinator) or an admin PIN token
  (HQ/IT). Every server function switches to this resolver instead of the
  current `adminToken`-only check, so agents can read their own data without
  the master PIN and never see anyone else's.
- `getCrmSnapshot` returns agent-scoped data for agent sessions,
  full floor for coordinator/authority; other agents' phone numbers stay
  nulled for agents.
- Coordinator sessions gain assign/balance/import rights; billing, secrets and
  system config stay PIN-only.

### Executive HQ "Ask HQ"
- New `src/lib/hq-ask.functions.ts` using Lovable AI (`google/gemini-3-flash`)
  with tool calls that return **structured chart specs** (`{ kind: "bar" |
  "line" | "pie" | "table" | "metrics", title, data }`) computed server-side
  from the live snapshot, plus the existing copilot actions (assign leads,
  update floor rules) reused for the action side.
- New `src/components/crm/AskHqPanel.tsx` renders the returned specs with the
  Recharts components already used on `/reports`, and keeps a short chat
  history in component state.

### Screen moves
- `src/routes/index.tsx` → role entry hall (public, no data).
- New `src/routes/queue.tsx` → the current agent queue UI, session-scoped.
- `src/routes/dispatch.tsx` → gains the Agent Queue table + keeps assignment.
- `src/routes/hq.tsx` → assignment UI removed, Ask HQ + read-only queue added.
- `src/routes/system.tsx` → gains Account approvals section.
- `src/routes/reports.tsx`, `/coach` → open to agent sessions, scoped.
- `AppShell` nav becomes role-aware: agents see Queue / Coach / Reports;
  coordinators see Coordinator Deck / Queue / Reports; PIN authority sees all.

### Android
The existing agent endpoints (`/api/public/agent/*`) keep working unchanged, so
the Android app needs no rebuild for this change.
