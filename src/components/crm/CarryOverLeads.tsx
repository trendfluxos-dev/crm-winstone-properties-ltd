import { AlarmClock } from "lucide-react";

import { WebCallButton } from "@/components/crm/WebCallButton";
import { WhatsAppAction } from "@/components/crm/WhatsAppAction";
import { useSnapshot } from "@/lib/crm-data";

/**
 * Yesterday's unfinished work, carried into today.
 *
 * A lead assigned on an earlier day whose work is still not COMPLETED (nobody
 * reached the customer, or the call was never classified) is shown here the next
 * morning as a pending lead, so it is never quietly dropped. Derived on read from
 * `leads.work_state` — no extra table, no scheduled job, so it is always true.
 */
function dhakaDayStart(at = new Date()) {
  const shifted = new Date(at.getTime() + 6 * 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 6 * 60 * 60 * 1000);
}

export function CarryOverLeads() {
  const { leads } = useSnapshot();
  const todayStart = dhakaDayStart().getTime();

  const rows = leads
    .filter((lead) => {
      if (lead.work_state === "completed") return false;
      const arrived = new Date(lead.created_at).getTime();
      if (arrived >= todayStart) return false;
      // Already worked today? Then it is today's work, not a carry-over.
      return !lead.last_call_at || new Date(lead.last_call_at).getTime() < todayStart;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (rows.length === 0) return null;

  const daysWaiting = (iso: string) =>
    Math.max(1, Math.round((todayStart - new Date(iso).getTime()) / 86_400_000));

  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <AlarmClock className="size-4 text-amber-600" />
        <h2 className="text-sm font-bold tracking-tight text-amber-700 dark:text-amber-400">
          গতকালের বাকি কাজ — আজকের পেন্ডিং লিড
        </h2>
        <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          {rows.length}টি
        </span>
      </header>
      <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">
        নির্ধারিত দিনে কাজ শেষ না হওয়া লিড পরদিন এখানে যুক্ত হয়। কল করে রিপোর্ট জমা দিলেই এটি
        তালিকা থেকে সরে যাবে।
      </p>

      <ul className="mt-3 space-y-2">
        {rows.slice(0, 25).map((lead) => (
          <li
            key={lead.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{lead.name}</p>
              <p className="tabular truncate text-xs text-muted-foreground">
                {lead.phone_number} · {daysWaiting(lead.created_at)} দিন বাকি
                {lead.call_attempts ? ` · ${lead.call_attempts} বার চেষ্টা` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <WebCallButton
                leadId={lead.id}
                phone={lead.phone_number}
                label="কল"
                className="h-9 flex-none text-sm"
              />
              <WhatsAppAction phone={lead.phone_number} leadId={lead.id} label="" />
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 25 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          আরও {rows.length - 25}টি লিড তালিকায় আছে — লিড ড্যাশবোর্ডে সব দেখুন।
        </p>
      ) : null}
    </section>
  );
}
