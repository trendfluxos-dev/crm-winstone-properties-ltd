import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HandPlatter, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { claimLead, listOpenLeads } from "@/lib/agent-desk.functions";
import { useAdminToken } from "@/lib/local-session";

/**
 * Leads nobody has taken yet. An agent pulls one into their own account with a
 * single tap — no coordinator and no phone app needed.
 */
export function OpenLeadsCard() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const fetchOpen = useServerFn(listOpenLeads);
  const claim = useServerFn(claimLead);

  const open = useQuery({
    queryKey: ["open-leads", adminToken ? "pin" : "session"],
    queryFn: () => fetchOpen({ data: { adminToken, limit: 50 } }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const take = useMutation({
    mutationFn: (leadId: string) => claim({ data: { adminToken, leadId } }),
    onSuccess: () => {
      toast.success("লিডটি এখন আপনার তালিকায়");
      void queryClient.invalidateQueries({ queryKey: ["open-leads"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["open-leads"] });
    },
  });

  const leads = open.data ?? [];

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-tight">খালি লিড — নিজে নিন</h2>
          <p className="text-xs text-muted-foreground">
            কারও নামে দেওয়া হয়নি এমন লিড। “নিজের নামে নিন” চাপলেই আপনার তালিকায় যোগ হবে।
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => void open.refetch()}
          disabled={open.isFetching}
        >
          {open.isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          রিফ্রেশ
        </Button>
      </header>

      {open.isPending ? (
        <p className="mt-4 text-xs text-muted-foreground">লোড হচ্ছে…</p>
      ) : leads.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">এখন কোনো খালি লিড নেই।</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {leads.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{lead.name}</p>
                <p className="tabular text-xs text-muted-foreground">
                  {lead.phone_number}
                  {lead.company ? ` · ${lead.company}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={take.isPending}
                onClick={() => take.mutate(lead.id)}
              >
                {take.isPending && take.variables === lead.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <HandPlatter className="size-3.5" />
                )}
                নিজের নামে নিন
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
