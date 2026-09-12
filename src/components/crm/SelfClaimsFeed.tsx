import { UserPlus } from "lucide-react";
import { useMemo } from "react";

import { useSnapshot } from "@/lib/crm-data";
import { relativeTime } from "@/lib/crm-format";

/**
 * Live feed of leads agents claimed for themselves (assignment_source = "self").
 * Shown in Coordinator Deck and Executive HQ so supervisors see self-assignments
 * the moment they happen.
 */
export function SelfClaimsFeed({ limit = 8 }: { limit?: number }) {
  const { profiles, leads } = useSnapshot();

  const claims = useMemo(() => {
    const nameOf = new Map(profiles.map((p) => [p.id, p.name]));
    return leads
      .filter((l) => l.assignment_source === "self" && l.assigned_to)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
      .map((lead) => ({
        id: lead.id,
        leadName: lead.name,
        phone: lead.phone_number,
        agentName: nameOf.get(lead.assigned_to!) ?? "অজানা এজেন্ট",
        when: relativeTime(lead.updated_at),
        status: lead.status,
      }));
  }, [profiles, leads, limit]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
          <UserPlus className="size-4 text-primary" />
          এজেন্টদের নিজের নেওয়া লিড
        </h2>
        <span className="text-xs text-muted-foreground">
          {claims.length ? `সর্বশেষ ${claims.length}টি` : "এখনো কেউ নেয়নি"}
        </span>
      </div>
      {claims.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground sm:text-sm">
          এজেন্টরা নিজে লিড নিলে সেটা এখানে সঙ্গে সঙ্গে দেখা যাবে।
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {claims.map((claim) => (
            <li
              key={claim.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {claim.leadName}
                  <span className="ml-2 font-normal text-muted-foreground">{claim.phone}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {claim.agentName} নিজে নিয়েছেন · {claim.when}
                </p>
              </div>
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {claim.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
