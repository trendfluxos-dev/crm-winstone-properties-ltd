import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, RefreshCw, ScrollText } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auditTrail } from "@/lib/ops.functions";
import { useAdminToken } from "@/lib/local-session";

const ACTION_LABEL: Record<string, string> = {
  account_approved: "একাউন্ট অনুমোদন",
  account_rejected: "একাউন্ট বাতিল",
  role_changed: "ভূমিকা পরিবর্তন",
  lead_created: "নতুন লিড",
  lead_imported: "লিড ইমপোর্ট",
  lead_assigned: "লিড অ্যাসাইন",
  lead_self_claimed: "নিজে লিড নিয়েছেন",
  call_report_submitted: "কল রিপোর্ট জমা",
  device_registered: "ডিভাইস নিবন্ধন",
  recording_reprocessed: "রেকর্ডিং পুনঃবিশ্লেষণ",
  alert_acknowledged: "সতর্কতা দেখা হয়েছে",
};

const ACTIONS = Object.keys(ACTION_LABEL);
const PAGE_SIZE = 25;

/**
 * Immutable audit history for the IT Console. Read-only by design: the table
 * has no update or delete policy, so nothing here can be rewritten from the app.
 */
export function AuditTrail() {
  const adminToken = useAdminToken();
  const fetchTrail = useServerFn(auditTrail);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("");
  const [page, setPage] = useState(0);

  const trail = useQuery({
    queryKey: ["audit-trail", adminToken ? "pin" : "session", search, action, page],
    queryFn: () =>
      fetchTrail({
        data: {
          adminToken,
          page,
          pageSize: PAGE_SIZE,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(action ? { action } : {}),
        },
      }),
  });

  const rows = trail.data?.rows ?? [];
  const total = trail.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <section className="card-elevated space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <ScrollText className="size-4" /> সাম্প্রতিক অডিট ঘটনা
          </h2>
          <p className="text-xs text-muted-foreground">
            কে কী করেছেন তার স্থায়ী রেকর্ড — এখান থেকে কিছু মুছে ফেলা বা বদলানো যায় না।
          </p>
        </div>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void trail.refetch()}>
          <RefreshCw className="size-3.5" /> রিফ্রেশ
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="নাম দিয়ে খুঁজুন"
          className="h-9 w-48"
        />
        <Button
          size="sm"
          variant={action === "" ? "default" : "outline"}
          onClick={() => {
            setAction("");
            setPage(0);
          }}
        >
          সব
        </Button>
        {ACTIONS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={action === key ? "default" : "outline"}
            onClick={() => {
              setAction(key);
              setPage(0);
            }}
          >
            {ACTION_LABEL[key]}
          </Button>
        ))}
      </div>

      {trail.isLoading ? (
        <p className="text-xs text-muted-foreground">লোড হচ্ছে…</p>
      ) : trail.isError ? (
        <p className="text-xs text-destructive">অডিট ইতিহাস আনা যায়নি। আবার চেষ্টা করুন।</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">এখনো কোনো ঘটনা নেই।</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">সময়</th>
                  <th className="py-2 pr-3 font-medium">কে</th>
                  <th className="py-2 pr-3 font-medium">কাজ</th>
                  <th className="py-2 pr-3 font-medium">বিষয়</th>
                  <th className="py-2 font-medium">বিবরণ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString("bn-BD")}
                    </td>
                    <td className="py-2 pr-3">{row.actor_label ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{ACTION_LABEL[row.action] ?? row.action}</Badge>
                    </td>
                    <td className="py-2 pr-3">{row.entity_type}</td>
                    <td className="py-2 text-muted-foreground">
                      {JSON.stringify(row.metadata ?? {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-border/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">{ACTION_LABEL[row.action] ?? row.action}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("bn-BD")}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium">{row.actor_label ?? "—"}</p>
                <p className="text-[11px] break-words text-muted-foreground">
                  {row.entity_type} · {JSON.stringify(row.metadata ?? {})}
                </p>
              </li>
            ))}
          </ul>

          <footer className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              মোট {total}টি · পাতা {page + 1}/{lastPage + 1}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-3.5" /> আগের
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              >
                পরের <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
