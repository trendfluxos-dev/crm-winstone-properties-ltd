import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { decideAccount, listAccountRequests } from "@/lib/accounts.functions";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

/** IT Console / HQ approval list for new agent and coordinator accounts. */
export function AccountApprovals() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const decide = useServerFn(decideAccount);

  const list = useQuery({
    queryKey: ["account-requests"],
    queryFn: () => listAccountRequests({ data: { adminToken: adminToken ?? "" } }),
    enabled: Boolean(adminToken),
    refetchInterval: 30_000,
  });

  const act = useMutation({
    mutationFn: (input: { profileId: string; decision: "approve_agent" | "approve_coordinator" | "reject" }) =>
      decide({ data: { adminToken: getAdminToken() ?? "", ...input } }),
    onSuccess: () => {
      toast.success("Account updated");
      void queryClient.invalidateQueries({ queryKey: ["account-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accounts = list.data?.accounts ?? [];
  const pending = accounts.filter((a) => a.approval_status === "pending");

  return (
    <section className="card-elevated p-4">
      <header className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Account approvals</h2>
        <span className="ml-auto text-xs text-muted-foreground">{pending.length} waiting</span>
      </header>

      {list.isPending && <p className="mt-3 text-sm text-muted-foreground">Loading accounts…</p>}

      {!list.isPending && accounts.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No account requests yet. Agents and coordinators appear here after they sign up.
        </p>
      )}

      <ul className="mt-3 divide-y divide-border">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {account.email ?? "no email"} · asked for{" "}
                {account.requested_role === "team_leader" ? "Coordinator" : "Agent"} ·{" "}
                {account.approval_status}
              </p>
            </div>
            {account.approval_status === "approved" ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                {account.role === "team_leader" ? "Coordinator" : "Agent"}
              </span>
            ) : (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ profileId: account.id, decision: "approve_agent" })}
                >
                  {act.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Agent
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ profileId: account.id, decision: "approve_coordinator" })
                  }
                >
                  Coordinator
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ profileId: account.id, decision: "reject" })}
                >
                  <X className="size-3.5" /> Decline
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
