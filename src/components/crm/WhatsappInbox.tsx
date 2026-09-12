import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, Search, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MyPhoneLine } from "@/components/crm/MyPhoneSetup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { logMyWhatsappMessage } from "@/lib/agent-desk.functions";
import { getWhatsappIntegrationStatus, sendWhatsappMessage } from "@/lib/whatsapp.functions";
import type { Lead, WhatsappMessage } from "@/lib/crm-data";
import { useSnapshot } from "@/lib/crm-data";
import { clockTime, dayLabel, relativeTime } from "@/lib/crm-format";
import { WhatsAppAction } from "@/components/crm/WhatsAppAction";
import { useAdminToken } from "@/lib/local-session";
import { cn } from "@/lib/utils";

type Thread = { lead: Lead; messages: WhatsappMessage[]; last: WhatsappMessage | null };

/**
 * WhatsApp inbox: every message the phone syncs for this agent's leads, grouped
 * into one conversation per lead. Refreshes with the CRM snapshot, so a message
 * logged from the phone shows up here without any manual step.
 */
export function WhatsappInbox() {
  const { leads, messages, isPending } = useSnapshot();
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const send = useServerFn(logMyWhatsappMessage);
  const { data: integration } = useQuery({
    queryKey: ["whatsapp-integration-status"],
    queryFn: () => getWhatsappIntegrationStatus(),
    staleTime: 5 * 60 * 1000,
  });
  const integrationStatus = integration?.status ?? "not_configured";
  const [search, setSearch] = useState("");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const threads = useMemo<Thread[]>(() => {
    const byLead = new Map<string, WhatsappMessage[]>();
    for (const message of messages) {
      if (!message.lead_id) continue;
      const list = byLead.get(message.lead_id) ?? [];
      list.push(message);
      byLead.set(message.lead_id, list);
    }
    return leads
      .map((lead) => {
        const thread = (byLead.get(lead.id) ?? []).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        return { lead, messages: thread, last: thread[thread.length - 1] ?? null };
      })
      .filter((t) => t.messages.length > 0)
      .sort(
        (a, b) =>
          new Date(b.last?.created_at ?? 0).getTime() - new Date(a.last?.created_at ?? 0).getTime(),
      );
  }, [leads, messages]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter(
      (t) =>
        t.lead.name.toLowerCase().includes(needle) ||
        t.lead.phone_number.includes(needle) ||
        (t.last?.message_content ?? "").toLowerCase().includes(needle),
    );
  }, [threads, search]);

  const active = filtered.find((t) => t.lead.id === openLeadId) ?? filtered[0] ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, active?.lead.id]);

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      if (integrationStatus === "configured") {
        const result = await sendApi({ data: { adminToken, leadId: active!.lead.id, body: text } });
        if (!result.ok) throw new Error(result.error);
        return result;
      }
      return send({
        data: { adminToken, leadId: active!.lead.id, senderType: "agent", messageContent: text },
      });
    },
    onSuccess: () => {
      setDraft("");
      if (integrationStatus === "configured") toast.success("WhatsApp মেসেজ পাঠানো হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <MessageCircle className="size-5 text-whatsapp" /> হোয়াটসঅ্যাপ ইনবক্স
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {threads.length}টি কথা · ফোন থেকে আসা প্রতিটি মেসেজ নিজে নিজেই এখানে জমা হয়
            <MyPhoneLine />
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {integrationStatus === "configured"
              ? "WhatsApp Business API: সংযুক্ত"
              : "WhatsApp Business API: সংযুক্ত নয় (INTEGRATION REQUIRED) — মেসেজ এজেন্টের নিজের হোয়াটসঅ্যাপ থেকে যাবে"}
          </p>

        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম, নম্বর বা মেসেজ খুঁজুন"
            className="pl-9"
          />
        </div>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">মেসেজ লোড হচ্ছে…</p>}

      {!isPending && threads.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          এখনো কোনো হোয়াটসঅ্যাপ কথা আসেনি। ফোন থেকে মেসেজ পাঠালে সেটি এখানে দেখা যাবে।
        </p>
      )}

      {threads.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((thread) => (
              <button
                key={thread.lead.id}
                onClick={() => setOpenLeadId(thread.lead.id)}
                className={cn(
                  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40",
                  active?.lead.id === thread.lead.id && "border-primary/60 bg-primary/5",
                )}
              >
                <p className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{thread.lead.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {relativeTime(thread.last?.created_at ?? null)}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {thread.last?.sender_type === "agent" ? "আপনি: " : ""}
                  {thread.last?.message_content ?? "মিডিয়া"}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                কিছু মেলেনি
              </p>
            )}
          </div>

          {active && (
            <div className="flex max-h-[520px] flex-col rounded-xl border border-border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{active.lead.name}</p>
                  <p className="tabular text-xs text-muted-foreground">{active.lead.phone_number}</p>
                </div>
                <WhatsAppAction
                  phone={active.lead.phone_number}
                  leadId={active.lead.id}
                  label="হোয়াটসঅ্যাপে খুলুন"
                />
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {active.messages.map((message, index) => {
                  const previous = active.messages[index - 1];
                  const newDay =
                    !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at);
                  const fromAgent = message.sender_type === "agent";
                  return (
                    <div key={message.id} className="space-y-2">
                      {newDay && (
                        <p className="text-center text-[11px] text-muted-foreground">
                          {dayLabel(message.created_at)}
                        </p>
                      )}
                      <div className={cn("flex", fromAgent ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl border px-3.5 py-2",
                            fromAgent
                              ? "rounded-br-sm border-whatsapp/25 bg-whatsapp/10"
                              : "rounded-bl-sm border-border bg-surface-2",
                          )}
                        >
                          <p className="text-sm">{message.message_content ?? "মিডিয়া ফাইল"}</p>
                          <p className="tabular mt-1 text-right text-[11px] text-muted-foreground">
                            {clockTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    className="resize-none"
                    placeholder="যে মেসেজটি পাঠিয়েছেন তা এখানে লিখে রাখুন"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (draft.trim() && !mutation.isPending) mutation.mutate(draft.trim());
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    disabled={!draft.trim() || mutation.isPending}
                    onClick={() => mutation.mutate(draft.trim())}
                    aria-label="মেসেজ সংরক্ষণ"
                  >
                    {mutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
