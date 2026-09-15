/**
 * The locked sales roster used by every agent picker in the UI.
 *
 * The database and all server logic are untouched — this is a presentation
 * guardrail only: selection lists must offer exactly the approved, active
 * agents/coordinators that already exist (7 today), with no duplicates and no
 * UI path to invent a new one.
 */
import type { Profile } from "@/lib/crm-data";

/** Loose key so the same person imported twice never shows up twice. */
function personKey(profile: Profile): string {
  if (profile.employee_id) return `emp:${profile.employee_id.trim().toLowerCase()}`;
  return `name:${profile.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Approved + active agents and team leaders, deduped and stably ordered. */
export function selectableAgents(profiles: Profile[]): Profile[] {
  const seen = new Set<string>();
  return profiles
    .filter(
      (p) =>
        p.is_active &&
        p.approval_status === "approved" &&
        (p.role === "agent" || p.role === "team_leader"),
    )
    .filter((p) => {
      const key = personKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      (a.employee_id ?? a.name).localeCompare(b.employee_id ?? b.name, "en", { numeric: true }),
    );
}
