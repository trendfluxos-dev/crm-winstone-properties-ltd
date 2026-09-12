import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";

import { useSnapshot } from "@/lib/crm-data";
import { assignmentHistory } from "@/lib/ops.functions";
import { useAdminToken } from "@/lib/local-session";

/** Who moved which lead to whom, newest first. */
export function AssignmentHistory() {
  const adminToken = useAdminToken();
  const fetchHistory = useServerFn(assignmentHistory);
  const { profiles, leads } = useSnapshot();

  const history = useQuery({
    queryKey: ["assignment-history", adminToken ? "pin" : "session"],
    queryFn: () => fetchHistory({ data: { adminToken, limit: 50 } }),
    refetchInterval: 60_000,
  });

  const nameOf = (id: string | null) =>
    (id ? profiles.find((p) => p.id === id)?.name : null) ?? "—";
  const leadOf = (id: string) => leads.find((l) => l.id === id)?.name ?? "লিড";

  const rows = history.data ?? [];

  return (
    <section className="card-elevated space-y-3 p-4">
      <header>
        <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
          <History className="size-4" /> অ্যাসাইনমেন্ট ইতিহাস
        </h2>
        <p className="text-xs text-muted-foreground">কোন লিড কে কার কাছে পাঠিয়েছেন — সব লেখা থাকে।</p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-5 text-center text-xs text-muted-foreground">
          এখনো কোনো অ্যাসাইনমেন্ট রেকর্ড নেই।
        </p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span>
                <strong>{leadOf(row.lead_id)}</strong> — {nameOf(row.from_agent_id)} →{" "}
                {nameOf(row.to_agent_id)}
                {row.source ? ` · ${row.source}` : ""}
              </span>
              <span className="text-muted-foreground">
                {new Date(row.created_at).toLocaleString("bn-BD")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
