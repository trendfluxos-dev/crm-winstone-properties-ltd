import { Users } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { selectableAgents } from "@/lib/agent-roster";
import { useSnapshot } from "@/lib/crm-data";
import type { ImportStats } from "@/lib/csv-leads";

/** Calm summary of what the uploaded file contains, in the ZIP's impact-bar style. */
export function ImportImpactBar({ stats, ready }: { stats: ImportStats; ready: number }) {
  const cells = [
    { label: "ফাইলের সারি", value: stats.total },
    { label: "ব্যবহারযোগ্য", value: stats.usable, gold: true },
    { label: "ফাইলে ডুপ্লিকেট", value: stats.duplicateInFile },
    { label: "নাম/নম্বর নেই", value: stats.noPhone },
    { label: "যোগ হবে", value: ready, gold: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-3 py-2.5">
          <p className="eyebrow text-[10px] text-muted-foreground">{cell.label}</p>
          <p
            className={`tabular mt-0.5 text-lg font-semibold ${cell.gold ? "text-primary" : "text-foreground"}`}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Pick exactly which active agents get today's leads, with a live per-agent count. */
export function AgentSplitPicker({
  selected,
  onChange,
  total,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  total: number;
}) {
  const data = useSnapshot();
  const agents = selectableAgents(data.profiles);
  const chosen = agents.filter((a) => selected.includes(a.id));
  const share = (index: number) =>
    chosen.length === 0
      ? 0
      : Math.floor(total / chosen.length) + (index < total % chosen.length ? 1 : 0);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  return (
    <section className="card-elevated space-y-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Users className="size-4 text-primary" /> আজ কারা লিড পাবে
          </h2>
          <p className="text-xs text-muted-foreground">
            {chosen.length
              ? `${chosen.length} জন এজেন্ট · জনপ্রতি প্রায় ${chosen.length ? Math.floor(total / chosen.length) : 0}টি লিড`
              : "কাউকে না বাছলে লিডগুলো অবণ্টিত থাকবে।"}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onChange(agents.map((a) => a.id))}
          >
            সবাই
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => onChange([])}
          >
            কেউ না
          </button>
        </div>
      </header>

      {agents.length === 0 ? (
        <p className="text-xs text-muted-foreground">কোনো চালু এজেন্ট নেই।</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {agents.map((agent) => {
            const index = chosen.findIndex((a) => a.id === agent.id);
            const isOn = index >= 0;
            return (
              <li key={agent.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                    isOn ? "border-primary/40 bg-accent/40" : "border-border/60 hover:bg-surface-2"
                  }`}
                >
                  <Checkbox checked={isOn} onCheckedChange={() => toggle(agent.id)} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {agent.name}
                    {agent.employee_id ? (
                      <span className="text-muted-foreground"> · {agent.employee_id}</span>
                    ) : null}
                  </span>
                  {isOn ? (
                    <span className="tabular text-sm font-semibold text-primary">
                      {share(index)}
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
