import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileText, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeDocument, type DocSummary } from "@/lib/doc-summary.functions";
import { getAdminToken } from "@/lib/local-session";

const MIME_ACCEPT = ".pdf,.docx,.xlsx,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg,.webp";

export function DocSummaryPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const summarize = useServerFn(summarizeDocument);
  const [summary, setSummary] = useState<DocSummary | null>(null);

  const run = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return summarize({
        data: {
          adminToken: getAdminToken(),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64: base64,
        },
      });
    },
    onSuccess: (data) => {
      setSummary(data);
      toast.success("স্মার্ট সারসংক্ষেপ তৈরি হয়েছে");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("ফাইলটি ৮ মেগাবাইটের বড় হওয়া যাবে না");
      return;
    }
    run.mutate(file);
    e.target.value = "";
  };

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">নথি আপলোড ও স্মার্ট সারসংক্ষেপ</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        ডক, এক্সেল, পিডিএফ বা ছবি আপলোড করুন — AI এজেন্টের নাম অনুযায়ী সাজানো সারসংক্ষেপ দেবে।
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={MIME_ACCEPT}
          className="sr-only"
          onChange={onChange}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={run.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {run.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          নথি বেছে নিন
        </Button>
        {run.isPending && <span className="text-xs text-muted-foreground">বোঝা হচ্ছে…</span>}
      </div>

      {summary && (
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-base font-semibold">{summary.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{summary.overview}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {summary.agents.map((agent) => (
              <Card key={agent.name} className="border-border bg-surface">
                <CardContent className="space-y-2 p-3">
                  <p className="font-semibold">{agent.name}</p>
                  <AgentSection icon="✓" title="হাইলাইটস" items={agent.highlights} />
                  <AgentSection icon="#" title="সংখ্যা" items={agent.numbers} />
                  <AgentSection icon="⚠" title="ঝুঁকি" items={agent.risks} tone="warning" />
                  <AgentSection
                    icon="→"
                    title="পরবর্তী পদক্ষেপ"
                    items={agent.actions}
                    tone="action"
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {summary.overallActions.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="size-3" />
                সামগ্রিক পরবর্তী পদক্ষেপ
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                {summary.overallActions.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AgentSection({
  icon,
  title,
  items,
  tone,
}: {
  icon: string;
  title: string;
  items: string[];
  tone?: "default" | "warning" | "action";
}) {
  if (items.length === 0) return null;
  const color =
    tone === "warning"
      ? "text-destructive"
      : tone === "action"
        ? "text-primary"
        : "text-foreground";
  return (
    <div className="text-sm">
      <p className="text-xs font-medium text-muted-foreground">
        {icon} {title}
      </p>
      <ul className={`mt-1 list-inside list-disc space-y-0.5 ${color}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
