/**
 * Pre-approved staff roster. Anyone on this list skips the approval queue when
 * they create an account; every other sign-up still waits for a decision in the
 * IT Console.
 */

export type RosterRole = "agent" | "team_leader";

const ROSTER: ReadonlyArray<{ name: string; role: RosterRole }> = [
  { name: "Elias Zahid", role: "team_leader" },
  { name: "Monisha Biswas", role: "team_leader" },
  { name: "Mst. Soniya Yeasmin", role: "agent" },
  { name: "Mst. Nazrin Akter", role: "agent" },
  { name: "Debbroto Kumar Chakroborty", role: "agent" },
];

/** Loose match: case, punctuation and spacing differences are ignored. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z\u0980-\u09FF0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Roster role for this name, or null when the person is not pre-approved. */
export function rosterRole(name: string): RosterRole | null {
  const key = normalizeName(name);
  return ROSTER.find((entry) => normalizeName(entry.name) === key)?.role ?? null;
}
