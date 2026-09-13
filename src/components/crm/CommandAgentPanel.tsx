import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Check, Loader2, Play, Send, Sparkle, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askCommandAgent, runCommandAgentAction } from "@/lib/command-agent.functions";
import { getAdminToken } from "@/lib/local-session";

type Surface = "desk" | "dispatch" | "hq" | "system";

type Action = { type: string; label: string; params: Record<string, string | number | null> };

type Turn = {
  id: number;
  question: string;
  answer?: string;
  facts?: string[];
  actions?: Action[];
  error?: string;
};

const SUGGESTIONS: Record<Surface, string[]> = {
  desk: [
    "আজ আমার কী কী বাকি আছে?",
    "কোন লিডগুলো এখনো শ্রেণিবিন্যাস হয়নি?",
    "আজকের ফলো-আপ কখন কখন?",
  ],
  dispatch: [
    "অমীমাংসিত লিডগুলো এজেন্টদের মধ্যে ভাগ করে দাও",
    "কার কাছে সবচেয়ে বেশি অমীমাংসিত লিড?",
    "কোন এজেন্টের রিপোর্ট বাকি আছে?",
  ],
  hq: [
    "আজকের ফ্লোরের অবস্থা সংক্ষেপে বলো",
    "কোন এজেন্ট সবচেয়ে বেশি কথা বলেছে?",
    "এই শিফটের সারসংক্ষেপ তৈরি করো",
  ],
  system: [
    "সিস্টেমে এখন কী কী সমস্যা আছে, আর সমাধান কী?",
    "Drive ব্যাকআপ যাচাই করো",
    "কোন রেকর্ডিং সার্ভারে ওঠেনি?",
  ],
};

const TITLE: Record<Surface, string> = {
  desk: "Winstone AI · আমার ডেস্ক",
  dispatch: "Winstone AI · কোঅর্ডিনেটর",
  hq: "Winstone AI · এক্সিকিউটিভ",
  system: "Winstone AI · আইটি কনসোল",
};

/**
 * One assistant, four surfaces. It answers from live data and may propose
 * actions — but the person always presses the button, and the server re-checks
 * the role before anything changes.
 */
export function CommandAgentPanel({ surface }: { surface: Surface }) {
  const ask = useServerFn(askCommandAgent);
  const run = useServerFn(runCommandAgentAction);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ranActions, setRanActions] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

  const history = turns
    .filter((turn) => turn.answer)
    .flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.answer as string },
    ])
    .slice(-6);

  const send = useMutation({
    mutationFn: async (value: string) => {
      const id = nextId.current++;
      setTurns((prev) => [...prev, { id, question: value }]);
      try {
        const result = await ask({
          data: { adminToken: getAdminToken(), surface, question: value, history },
        });
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  answer: result.answer,
                  facts: result.facts,
                  actions: result.actions as Action[],
                }
              : turn,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "উত্তর আসেনি";
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: message } : t)));
        throw error;
      }
    },
    onSuccess: () => setQuestion(""),
  });

  const execute = useMutation({
    mutationFn: async ({ key, action }: { key: string; action: Action }) => {
      setPendingAction(key);
      try {
        return await run({
          data: {
            adminToken: getAdminToken(),
            surface,
            action: { type: action.type as never, params: action.params },
          },
        });
      } finally {
        setPendingAction(null);
      }
    },
    onSuccess: (result, { key }) => {
      if (result.ok) {
        toast.success(result.message);
        setRanActions((prev) => ({ ...prev, [key]: result.message }));
      } else {
        toast.warning(result.message);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Keep the newest answer in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns]);

  const canSend = question.trim().length >= 3 && !send.isPending;

  return (
    <section className="card-elevated overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-4" />
        </span>
        <h2 className="text-sm font-semibold">{TITLE[surface]}</h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          লাইভ তথ্য
        </span>
      </header>

      <div className="space-y-3 px-4 py-4">
        {turns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            সাধারণ বাংলায় লিখুন — উত্তর আসবে শুধু লাইভ তথ্য থেকে, আর করার মতো কাজ থাকলে বোতাম
            হিসেবে দেখাবে। কোনো কাজ নিজে নিজে চলে না।
          </p>
        ) : (
          <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-2">
                <p className="flex items-start gap-2 text-sm font-medium">
                  <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>{turn.question}</span>
                </p>

                {turn.error ? (
                  <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {turn.error}
                  </p>
                ) : turn.answer ? (
                  <div className="space-y-2 pl-5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.answer}</p>

                    {(turn.facts?.length ?? 0) > 0 && (
                      <ul className="space-y-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                        {turn.facts?.map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                    )}

                    {(turn.actions?.length ?? 0) > 0 && (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs font-semibold">করার মতো কাজ — আপনি চাপলেই চলবে</p>
                        <div className="flex flex-wrap gap-2">
                          {turn.actions?.map((action, index) => {
                            const key = `${turn.id}-${action.type}-${index}`;
                            const done = ranActions[key];
                            return (
                              <Button
                                key={key}
                                size="sm"
                                variant={done ? "outline" : "secondary"}
                                disabled={Boolean(done) || pendingAction !== null}
                                onClick={() => execute.mutate({ key, action })}
                              >
                                {pendingAction === key ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : done ? (
                                  <Check className="size-3.5" />
                                ) : (
                                  <Play className="size-3.5" />
                                )}
                                {done ? "হয়ে গেছে" : action.label}
                              </Button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          আপনার অনুমতির বাইরের কাজ সার্ভারেই আটকে যায়।
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    aria-live="polite"
                    className="flex animate-pulse items-center gap-2 pl-5 text-xs text-muted-foreground"
                  >
                    <Sparkle className="size-3.5" />
                    হিসাব মিলিয়ে দেখছে…
                  </p>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="যেমন: আজ কোন লিডে আগে কল করা দরকার?"
            className="min-w-0 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) send.mutate(question.trim());
            }}
          />
          <Button
            className="sm:w-auto"
            disabled={!canSend}
            onClick={() => send.mutate(question.trim())}
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            পাঠান
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS[surface].map((s) => (
            <button
              key={s}
              type="button"
              disabled={send.isPending}
              onClick={() => send.mutate(s)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
