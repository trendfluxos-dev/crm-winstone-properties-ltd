import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { decideAccount, listAccountRequests } from "@/lib/accounts.functions";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

const STATUS_LABELS: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  approved: "অনুমোদিত",
  rejected: "বাতিল",
};

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
    mutationFn: (input: {
      profileId: string;
      decision: "approve_agent" | "approve_coordinator" | "reject";
    }) => decide({ data: { adminToken: getAdminToken() ?? "", ...input } }),
    onSuccess: () => {
      toast.success("অ্যাকাউন্ট হালনাগাদ হয়েছে");
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
        <h2 className="text-sm font-semibold">অ্যাকাউন্ট অনুমোদন</h2>
        <span className="ml-auto text-xs text-muted-foreground">{pending.length}টি অপেক্ষমাণ</span>
      </header>

      {list.isPending && (
        <p className="mt-3 text-sm text-muted-foreground">অ্যাকাউন্ট আনা হচ্ছে…</p>
      )}

      {!list.isPending && accounts.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          এখনো কোনো অনুরোধ নেই। এজেন্ট আর কোঅর্ডিনেটর সাইন আপ করলে এখানে দেখা যাবে।
        </p>
      )}

      <ul className="mt-3 divide-y divide-border">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {account.email ?? "ইমেইল নেই"} · চেয়েছেন{" "}
                {account.requested_role === "team_leader" ? "কোঅর্ডিনেটর" : "এজেন্ট"} ·{" "}
                {STATUS_LABELS[account.approval_status] ?? account.approval_status}
              </p>
            </div>
            {account.approval_status === "approved" ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                {account.role === "team_leader" ? "কোঅর্ডিনেটর" : "এজেন্ট"}
              </span>
            ) : (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ profileId: account.id, decision: "approve_agent" })}
                >
                  {act.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  এজেন্ট
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ profileId: account.id, decision: "approve_coordinator" })
                  }
                >
                  কোঅর্ডিনেটর
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ profileId: account.id, decision: "reject" })}
                >
                  <X className="size-3.5" /> বাদ দিন
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
