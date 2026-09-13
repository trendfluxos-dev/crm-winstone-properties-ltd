import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { askCopilot } from "@/lib/copilot.functions";
import { getAdminToken } from "@/lib/local-session";

type Card = { title: string; rows: { label: string; value: string }[] };
type Entry = { role: "user" | "assistant"; content: string; cards?: Card[] };

const SUGGESTIONS = [
  "আজকের সেরা ৩ এজেন্টকে কথার সময়সহ দেখাও",
  "এই মাসের টেলিফোন বিলের রিপোর্ট বানাও",
  "সোনিয়াকে ২০টি অমীমাংসিত লিড দাও",
];

/** Floating natural-language command console for HQ and coordinators. */
export function CopilotDrawer({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [log, setLog] = useState<Entry[]>([]);
  const queryClient = useQueryClient();
  const ask = useServerFn(askCopilot);
  const endRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const history = [...log, { role: "user" as const, content: text }];
      setLog(history);
      setDraft("");
      const result = await ask({
        data: {
          adminToken: getAdminToken() ?? "",
          messages: history.map(({ role, content }) => ({ role, content })),
        },
      });
      return result;
    },
    onSuccess: (result) => {
      setLog((prev) => [
        ...prev,
        { role: "assistant", content: result.reply, cards: result.cards },
      ]);
      if (result.mutated) void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-2">
            <Sparkles className="size-4" /> AI Copilot
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> এক্সিকিউটিভ এআই কোপাইলট
          </SheetTitle>
          <SheetDescription>সাধারণ ভাষায় পারফরম্যান্স, বিল বা লিড বণ্টন চান।</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {log.length === 0 && (
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send.mutate(s)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {log.map((entry, index) => (
            <div
              key={index}
              className={
                entry.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary/15 px-3 py-2 text-sm"
                  : "max-w-[95%] space-y-2"
              }
            >
              {entry.role === "assistant" ? (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap">
                  {entry.content}
                </div>
              ) : (
                entry.content
              )}
              {entry.cards?.map((card) => (
                <div
                  key={card.title}
                  className="rounded-lg border border-primary/30 bg-surface-2 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {card.title}
                  </p>
                  <dl className="mt-2 space-y-1">
                    {card.rows.map((row) => (
                      <div key={row.label} className="flex justify-between gap-3 text-sm">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className="tabular font-medium">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ))}
          {send.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> কাজ চলছে…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="যেমন: নাজরিনকে ৩০টি অমীমাংসিত লিড দাও"
              rows={2}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim() && !send.isPending) send.mutate(draft.trim());
                }
              }}
            />
            <Button
              size="icon"
              disabled={!draft.trim() || send.isPending}
              onClick={() => send.mutate(draft.trim())}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
