import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { WebCallButton } from "@/components/crm/WebCallButton";
import { WhatsAppAction } from "@/components/crm/WhatsAppAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSnapshot, type Lead } from "@/lib/crm-data";
import { useAdminToken } from "@/lib/local-session";
import { setLeadWorkDate } from "@/lib/workday.functions";

/**
 * Day-by-day lead work.
 *
 * A lead assigned to an agent never leaves their dashboard — this board only
 * decides which working day it is listed under. The agent can pull any older
 * lead into today's work, or into another chosen day, and every move is written
 * to the lead timeline, so nothing is lost and the IT council keeps the history.
 */
function dhakaToday() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dayOf(lead: Lead) {
  return (
    lead.work_date ??
    new Date(new Date(lead.created_at).getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
}

const WORK_LABELS: Record<string, string> = {
  completed: "শেষ",
  in_progress: "চলছে",
  pending: "বাকি",
};

export function LeadDayBoard() {
  const { leads } = useSnapshot();
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const move = useServerFn(setLeadWorkDate);
  const [day, setDay] = useState(dhakaToday());
  const [search, setSearch] = useState("");

  const pull = useMutation({
    mutationFn: (leadId: string) => move({ data: { adminToken, leadId, workDate: day } }),
    onSuccess: () => {
      toast.success("লিডটি এই দিনের কাজে যোগ হয়েছে");
      setSearch("");
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dayLeads = useMemo(
    () =>
      leads
        .filter((lead) => dayOf(lead) === day)
        .sort((a, b) => (a.serial_no ?? "").localeCompare(b.serial_no ?? "", "bn", { numeric: true })),
    [leads, day],
  );

  const others = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length < 2) return [];
    return leads
      .filter((lead) => dayOf(lead) !== day)
      .filter(
        (lead) =>
          lead.name.toLowerCase().includes(needle) ||
          lead.phone_number.includes(needle) ||
          (lead.serial_no ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [leads, day, search]);

  const done = dayLeads.filter((l) => l.work_state === "completed").length;

  return (
    <section className="card-elevated space-y-3 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarDays className="size-4 text-primary" />
        <h2 className="text-sm font-bold tracking-tight">দিনের কাজ</h2>
        <input
          type="date"
          value={day}
          max={dhakaToday()}
          onChange={(e) => setDay(e.target.value || dhakaToday())}
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
          aria-label="কাজের দিন"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {dayLeads.length}টি লিড · {done}টি শেষ · {dayLeads.length - done}টি বাকি
        </span>
      </header>

      <p className="text-xs text-muted-foreground">
        পুরোনো যেকোনো লিড খুঁজে এই দিনের কাজে আনতে পারেন — লিড আপনার তালিকা থেকে কখনো সরে না, শুধু
        কোন দিনের কাজে আছে তা বদলায়।
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="পুরোনো লিড খুঁজুন (নাম, নম্বর, সিরিয়াল)"
          className="pl-9"
        />
      </div>

      {others.length > 0 && (
        <ul className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2">
          {others.map((lead) => (
            <li key={lead.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{lead.name}</p>
                <p className="tabular truncate text-xs text-muted-foreground">
                  {lead.phone_number} · {dayOf(lead)} ·{" "}
                  {WORK_LABELS[lead.work_state] ?? lead.work_state}
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                disabled={pull.isPending}
                onClick={() => pull.mutate(lead.id)}
              >
                {pull.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                এই দিনে আনুন
              </Button>
            </li>
          ))}
        </ul>
      )}

      {dayLeads.length === 0 ? (
        <p className="text-sm text-muted-foreground">এই দিনের জন্য এখনো কোনো লিড নেই।</p>
      ) : (
        <ul className="space-y-2">
          {dayLeads.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {lead.name}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      lead.work_state === "completed"
                        ? "bg-live/10 text-live"
                        : "bg-idle/15 text-idle-foreground"
                    }`}
                  >
                    {WORK_LABELS[lead.work_state] ?? lead.work_state}
                  </span>
                </p>
                <p className="tabular truncate text-xs text-muted-foreground">
                  {lead.phone_number}
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
      )}
    </section>
  );
}
