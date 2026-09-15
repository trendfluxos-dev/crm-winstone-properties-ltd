import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminToken } from "@/lib/local-session";
import { distributeLeadPool, leadPoolStatus } from "@/lib/lead-pool.functions";

/**
 * The company lead database, in the IT Console.
 *
 * Unassigned leads wait here. IT types how many each agent should get for the
 * day and that many go out to every active agent, oldest first; the rest stay in
 * the database. Every hand-over is recorded in the lead's own history.
 */
export function LeadDatabasePanel() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(leadPoolStatus);
  const distributeFn = useServerFn(distributeLeadPool);
  const [perAgent, setPerAgent] = useState("");

  const status = useQuery({
    queryKey: ["lead-pool", adminToken ? "pin" : "session"],
    queryFn: () => statusFn({ data: { adminToken } }),
    refetchInterval: 60_000,
  });

  const quantity = Number(perAgent);
  const agentCount = status.data?.agents.length ?? 0;
  const poolCount = status.data?.poolCount ?? 0;
  const willSend = Math.min(quantity * agentCount || 0, poolCount);

  const send = useMutation({
    mutationFn: () => distributeFn({ data: { adminToken, perAgent: quantity, saveAsDaily: true } }),
    onSuccess: (result) => {
      toast.success(
        `${result.agents} জন এজেন্টকে মোট ${result.moved}টি লিড দেওয়া হয়েছে — ডেটাবেজে বাকি ${result.remaining}টি${
          result.duplicatesSkipped
            ? ` · ${result.duplicatesSkipped}টি ডুপ্লিকেট নম্বর বাদ পড়েছে`
            : ""
        }`,
      );
      setPerAgent("");
      void queryClient.invalidateQueries({ queryKey: ["lead-pool"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["lead-day"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="card-elevated space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Database className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">লিড ডেটাবেজ</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {status.isPending ? "…" : `${poolCount}টি লিড অপেক্ষায়`}
        </span>
      </header>

      <p className="text-xs text-muted-foreground">
        যেসব লিড এখনো কারো নামে দেওয়া হয়নি সেগুলো এখানে জমা থাকে। প্রতিদিন প্রতি এজেন্টের জন্য
        সংখ্যা লিখে দিন — ঠিক ততটি লিড সব চালু এজেন্টের কাছে চলে যাবে, বাকিগুলো ডেটাবেজেই থাকবে।
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          প্রতি এজেন্টকে কতটি লিড
          <Input
            value={perAgent}
            inputMode="numeric"
            placeholder="যেমন ৩০"
            onChange={(event) => setPerAgent(event.target.value.replace(/\D/g, "").slice(0, 3))}
            className="h-9 w-28"
          />
        </label>
        <Button
          size="sm"
          disabled={send.isPending || !quantity || agentCount === 0 || poolCount === 0}
          onClick={() => send.mutate()}
        >
          {send.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Share2 className="size-4" />
          )}
          এজেন্টদের দিয়ে দিন
        </Button>
        {quantity && agentCount ? (
          <p className="text-xs text-muted-foreground">
            {agentCount} জন × {quantity} = {willSend}টি যাবে · বাকি থাকবে {poolCount - willSend}টি
          </p>
        ) : null}
      </div>

      {status.data && status.data.agents.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[380px] text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">এজেন্ট</th>
                <th className="px-3 py-2 text-right font-medium">আজকের</th>
                <th className="px-3 py-2 text-right font-medium">বাকি</th>
                <th className="px-3 py-2 text-right font-medium">মোট</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {status.data.agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-3 py-2">{agent.name}</td>
                  <td className="tabular px-3 py-2 text-right">{agent.today}</td>
                  <td className="tabular px-3 py-2 text-right">{agent.pending}</td>
                  <td className="tabular px-3 py-2 text-right font-medium">{agent.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {status.data && status.data.preview.length > 0 ? (
        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">
            ডেটাবেজে থাকা লিড দেখুন ({poolCount}টি)
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {status.data.preview.map((lead) => (
              <li key={lead.id} className="flex justify-between gap-3">
                <span className="truncate">{lead.name}</span>
                <span className="tabular">{lead.phone_number}</span>
              </li>
            ))}
            {poolCount > status.data.preview.length ? (
              <li>… আরও {poolCount - status.data.preview.length}টি</li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
