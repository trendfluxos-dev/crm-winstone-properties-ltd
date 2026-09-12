import { PhoneCall } from "lucide-react";
import { useMemo } from "react";

import { CallEntry } from "@/components/crm/LeadDossier";
import { useSnapshot } from "@/lib/crm-data";

/** Every recording synced for the agent's own calls, newest first. */
export function MyCallLog() {
  const { leads, calls, isPending } = useSnapshot();

  const ordered = useMemo(
    () =>
      [...calls].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [calls],
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <PhoneCall className="size-5 text-primary" /> আমার কল রেকর্ড
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {ordered.length}টি কল · ফোন থেকে অডিও আসার পর এআই সারমর্ম যোগ হয়
        </p>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">কল লোড হচ্ছে…</p>}

      {!isPending && ordered.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          এখনো কোনো কল রেকর্ড আসেনি। ফোন থেকে কল করলে সেটি এখানে দেখা যাবে।
        </p>
      )}

      <div className="space-y-4">
        {ordered.map((call) => {
          const lead = leads.find((l) => l.id === call.lead_id);
          return (
            <div key={call.id} className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                লিড: <span className="font-medium text-foreground">{lead?.name ?? "অজানা"}</span>
                {lead?.company ? ` · ${lead.company}` : ""}
              </p>
              <CallEntry call={call} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
