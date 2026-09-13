import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Play, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askCommandAgent, runCommandAgentAction } from "@/lib/command-agent.functions";
import { getAdminToken } from "@/lib/local-session";

type Surface = "desk" | "dispatch" | "hq" | "system";

type Action = { type: string; label: string; params: Record<string, string | number | null> };

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
    "পাইপলাইনে কোথায় আটকে আছে?",
    "Drive ব্যাকআপ যাচাই করো",
    "কোন রেকর্ডিং সার্ভারে ওঠেনি?",
  ],
};

const TITLE: Record<Surface, string> = {
  desk: "কমান্ড এজেন্ট · আমার ডেস্ক",
  dispatch: "কমান্ড এজেন্ট · কোঅর্ডিনেটর",
  hq: "কমান্ড এজেন্ট · এক্সিকিউটিভ",
  system: "কমান্ড এজেন্ট · আইটি কনসোল",
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
  const [log, setLog] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const send = useMutation({
    mutationFn: (value: string) =>
      ask({ data: { adminToken: getAdminToken(), surface, question: value, history: log.slice(-6) } }),
    onSuccess: (result, value) => {
      setLog((prev) => [
        ...prev,
        { role: "user" as const, content: value },
        { role: "assistant" as const, content: result.answer },
      ]);
      setQuestion("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const execute = useMutation({
    mutationFn: (action: Action) =>
      run({
        data: {
          adminToken: getAdminToken(),
          surface,
          action: { type: action.type as never, params: action.params },
        },
      }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const result = send.data;
  const actions = (result?.actions ?? []) as Action[];

  return (
    <section className="card-elevated p-4">
      <header className="flex items-center gap-2">
        <Bot className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{TITLE[surface]}</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        সাধারণ বাংলায় লিখুন — উত্তর আসবে শুধু লাইভ তথ্য থেকে, আর করার মতো কাজ থাকলে বোতাম হিসেবে দেখাবে।
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="যেমন: আজ কোন লিডে আগে কল করা দরকার?"
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && question.trim().length > 2 && !send.isPending) {
              send.mutate(question.trim());
            }
          }}
        />
        <Button
          disabled={question.trim().length < 3 || send.isPending}
          onClick={() => send.mutate(question.trim())}
        >
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          পাঠান
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS[surface].map((s) => (
          <button
            key={s}
            type="button"
            disabled={send.isPending}
            onClick={() => send.mutate(s)}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="whitespace-pre-wrap text-sm">{result.answer}</p>

          {result.facts.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {result.facts.map((fact) => (
                <li key={fact}>• {fact}</li>
              ))}
            </ul>
          )}

          {actions.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold">করার মতো কাজ — আপনি চাপলেই চলবে</p>
              <div className="flex flex-wrap gap-2">
                {actions.map((action, index) => (
                  <Button
                    key={`${action.type}-${index}`}
                    size="sm"
                    variant="secondary"
                    disabled={execute.isPending}
                    onClick={() => execute.mutate(action)}
                  >
                    {execute.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {action.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                কোনো কাজ নিজে নিজে চলে না — এবং আপনার অনুমতির বাইরের কাজ সার্ভারেই আটকে যায়।
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
