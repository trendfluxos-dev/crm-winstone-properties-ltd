import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askHq } from "@/lib/hq-ask.functions";
import { getAdminToken } from "@/lib/local-session";

const SUGGESTIONS = [
  "এই মাসে প্রতি এজেন্টের কথা হওয়া কল তুলনা করো",
  "কোন এজেন্টের কাছে সবচেয়ে বেশি অমীমাংসিত লিড আছে?",
  "দৈনিক কলের ধারাটা দেখাও",
  "ফ্লোরে কথার সময় কেমন ভাগ হয়েছে?",
];

/** Ask HQ: type a question, get a written answer plus a live chart. */
export function AskHqPanel() {
  const ask = useServerFn(askHq);
  const [question, setQuestion] = useState("");

  const run = useMutation({
    mutationFn: (value: string) => ask({ data: { adminToken: getAdminToken(), question: value } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const result = run.data;
  const chart = result?.chart;
  const hasChart = chart && chart.kind !== "none" && chart.data.length > 0;

  return (
    <section className="card-elevated p-4">
      <header className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">এইচকিউ-কে জিজ্ঞেস করুন</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        সাধারণ ভাষায় যে কোনো রিপোর্ট চান। উত্তর আর চার্ট তৈরি হবে সরাসরি লাইভ তথ্য থেকে।
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="যেমন: এই সপ্তাহে কোন এজেন্ট সবচেয়ে বেশি লিড শেষ করেছে?"
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && question.trim().length > 2 && !run.isPending) {
              run.mutate(question.trim());
            }
          }}
        />
        <Button
          disabled={question.trim().length < 3 || run.isPending}
          onClick={() => run.mutate(question.trim())}
        >
          {run.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          জিজ্ঞেস করুন
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuestion(s);
              run.mutate(s);
            }}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <p className="whitespace-pre-wrap text-sm">{result.answer}</p>
          {hasChart && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {chart.title}
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  {chart.kind === "line" ? (
                    <LineChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey={chart.xKey} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      {chart.series.map((s, i) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={`hsl(var(--chart-${(i % 5) + 1}))`}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey={chart.xKey} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      {chart.series.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          name={s.label}
                          fill={`hsl(var(--chart-${(i % 5) + 1}))`}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
