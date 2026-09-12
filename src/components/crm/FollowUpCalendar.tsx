import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Check, PhoneCall } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { WhatsAppAction } from "@/components/crm/WhatsAppAction";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { completeFollowUp, myFollowUps } from "@/lib/call-reports.functions";
import { useAdminToken } from "@/lib/local-session";

type View = "day" | "week" | "month" | "agenda";

const STATE_LABEL: Record<string, string> = {
  overdue: "সময় পার হয়েছে",
  due: "এখনই করার সময়",
  upcoming: "আসছে",
  done: "সম্পন্ন",
};

const STATE_TONE: Record<string, string> = {
  overdue: "bg-destructive/15 text-destructive",
  due: "bg-amber-500/15 text-amber-700",
  upcoming: "bg-primary/10 text-primary",
  done: "bg-muted text-muted-foreground",
};

function rangeFor(view: View) {
  const from = new Date();
  const to = new Date();
  from.setHours(0, 0, 0, 0);
  if (view === "day") to.setHours(23, 59, 59, 999);
  else if (view === "week") to.setDate(to.getDate() + 7);
  else if (view === "month") to.setDate(to.getDate() + 31);
  else to.setDate(to.getDate() + 90);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** Follow-up calendar: day / week / month / agenda over follow_up_events. */
export function FollowUpCalendar() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const fetchEvents = useServerFn(myFollowUps);
  const done = useServerFn(completeFollowUp);
  const [view, setView] = useState<View>("day");

  const range = useMemo(() => rangeFor(view), [view]);

  const events = useQuery({
    queryKey: ["follow-ups", view, adminToken ? "pin" : "session"],
    queryFn: () => fetchEvents({ data: { adminToken, ...range } }),
    refetchInterval: 60_000,
  });

  const finish = useMutation({
    mutationFn: (eventId: string) => done({ data: { adminToken, eventId } }),
    onSuccess: () => {
      toast.success("ফলো-আপ সম্পন্ন হিসেবে চিহ্নিত হলো");
      void queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = events.data ?? [];
  const overdue = rows.filter((row) => row.state === "overdue").length;
  const due = rows.filter((row) => row.state === "due").length;

  return (
    <section className="card-elevated space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <CalendarClock className="size-4" /> ফলো-আপ ক্যালেন্ডার
          </h2>
          <p className="text-xs text-muted-foreground">
            {overdue > 0 ? `${overdue}টি সময় পার হয়েছে · ` : ""}
            {due > 0 ? `${due}টি এখনই করার সময় · ` : ""}
            রিমাইন্ডার কল/মেসেজের ১৫ মিনিট আগে।
          </p>
        </div>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="day">দিন</TabsTrigger>
            <TabsTrigger value="week">সপ্তাহ</TabsTrigger>
            <TabsTrigger value="month">মাস</TabsTrigger>
            <TabsTrigger value="agenda">তালিকা</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">
          এই সময়ের মধ্যে কোনো ফলো-আপ নেই।
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {event.customer_name ?? "ক্রেতা"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {event.phone_number ?? ""}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.scheduled_at).toLocaleString("bn-BD")} · {event.category}
                  {event.priority ? ` · ${event.priority}` : ""}
                </p>
                {event.note ? <p className="mt-1 text-xs">{event.note}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={STATE_TONE[event.state]}>{STATE_LABEL[event.state]}</Badge>
                {event.phone_number ? (
                  <>
                    <Button asChild size="sm" variant="secondary" className="gap-1">
                      <a href={`tel:${event.phone_number}`}>
                        <PhoneCall className="size-3.5" /> কল
                      </a>
                    </Button>
                    <WhatsAppAction
                      phone={event.phone_number}
                      leadId={event.lead_id ?? null}
                      label="মেসেজ"
                      variant="ghost"
                    />
                  </>
                ) : null}
                {event.status !== "done" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={finish.isPending}
                    onClick={() => finish.mutate(event.id)}
                  >
                    <Check className="size-3.5" /> হয়েছে
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
