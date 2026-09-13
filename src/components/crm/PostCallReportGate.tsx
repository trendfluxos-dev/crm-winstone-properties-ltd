import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { myPendingReport, submitMyReport } from "@/lib/call-reports.functions";
import { useAdminToken } from "@/lib/local-session";

/** Categories in the order agents pick them, with their Bengali labels. */
const CATEGORIES = [
  { value: "hot_lead", label: "HOT LEAD — খুব সম্ভাবনাময়" },
  { value: "follow_up", label: "FOLLOW UP — পরে যোগাযোগ" },
  { value: "interested", label: "INTERESTED — আগ্রহী" },
  { value: "not_interested", label: "NOT INTERESTED — আগ্রহী নয়" },
  { value: "callback", label: "CALLBACK — কলব্যাক চেয়েছেন" },
  { value: "no_answer", label: "NO ANSWER — ধরেনি" },
  { value: "wrong_number", label: "WRONG NUMBER — ভুল নম্বর" },
  { value: "closed_converted", label: "CLOSED / CONVERTED — বিক্রি হয়েছে" },
] as const;

const NEEDS_REASON = new Set(["not_interested", "wrong_number"]);

/** Classification, mandatory whenever the customer actually answered. */
const TEMPERATURES = [
  { value: "hot", label: "HOT — গরম" },
  { value: "warm", label: "WARM — কিছুটা আগ্রহী" },
  { value: "cold", label: "COLD — ঠান্ডা" },
] as const;

const GRADES = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
] as const;

/**
 * The next-lead lock, on the web desk.
 *
 * While an agent has an unfinished post-call report this stays open: the report
 * must be submitted with a category (and its required fields) before the desk is
 * usable again. The same rule is enforced in the database, so closing the tab
 * does not skip it.
 */
export function PostCallReportGate() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const fetchPending = useServerFn(myPendingReport);
  const submit = useServerFn(submitMyReport);

  const pending = useQuery({
    queryKey: ["pending-call-report", adminToken ? "pin" : "session"],
    queryFn: () => fetchPending({ data: { adminToken } }),
    refetchInterval: 20_000,
  });

  const [category, setCategory] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("");
  const [aiDecision, setAiDecision] = useState<"accepted" | "edited" | "rejected" | null>(null);

  const detail = pending.data;
  const suggestion = detail?.suggestion ?? null;

  useEffect(() => {
    if (!detail) {
      setCategory("");
      setSummary("");
      setNote("");
      setReason("");
      setWhen("");
      setAiDecision(null);
    }
  }, [detail?.report?.id, detail]);

  const send = useMutation({
    mutationFn: () =>
      submit({
        data: {
          adminToken,
          reportId: detail!.report.id,
          category,
          summary: summary.trim() || null,
          note: note.trim() || null,
          reason: reason.trim() || null,
          followUpAt: when ? new Date(when).toISOString() : null,
          reminderMinutes: 15,
          aiDecision,
        },
      }),
    onSuccess: () => {
      toast.success("রিপোর্ট জমা হয়েছে — পরের লিড খুলে গেল");
      void queryClient.invalidateQueries({ queryKey: ["pending-call-report"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!detail) return null;

  const reasonRequired = NEEDS_REASON.has(category);
  // Every call: category + summary + note + follow-up date are all mandatory.
  const ready =
    Boolean(category) &&
    summary.trim().length > 1 &&
    note.trim().length > 1 &&
    Boolean(when) &&
    (!reasonRequired || reason.trim().length > 1);

  const applySuggestion = () => {
    if (!suggestion) return;
    if (suggestion.suggestedCategory) setCategory(suggestion.suggestedCategory);
    if (suggestion.suggestedFollowUpAt) {
      setWhen(new Date(suggestion.suggestedFollowUpAt).toISOString().slice(0, 16));
    }
    if (!summary.trim() && suggestion.summary.length) {
      setSummary(suggestion.summary.join(" • "));
    }
    if (!note.trim() && suggestion.nextAction) setNote(suggestion.nextAction);
    setAiDecision("accepted");
  };

  return (
    <Dialog open>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-600" />
            কল রিপোর্ট বাকি আছে
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {detail.lead?.name ?? "লিড"} —{" "}
          {detail.lead?.phone_number ?? detail.report.phone_number ?? ""} ·{" "}
          {detail.report.duration_seconds}s{detail.report.connected ? "" : " · কথা হয়নি"}
        </p>

        {detail.recording && detail.recording.analysis_status !== "completed" ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {detail.recording.analysis_status === "failed"
              ? "AI বিশ্লেষণ ব্যর্থ হয়েছে — রিপোর্ট নিজেই লিখে দিন।"
              : detail.recording.analysis_status === "not_available"
                ? "এই কলে কথা শোনা যায়নি — রিপোর্ট নিজেই লিখুন।"
                : "AI বিশ্লেষণ চলছে… রিপোর্ট এখনই জমা দিতে পারেন।"}
          </p>
        ) : null}

        {suggestion ? (
          <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Bot className="size-3.5" /> AI সহকারীর পরামর্শ (চূড়ান্ত সিদ্ধান্ত আপনারই)
            </p>
            {suggestion.summary.length ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {suggestion.summary.slice(0, 4).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {suggestion.objections.length ? (
              <p className="text-xs">আপত্তি: {suggestion.objections.join(", ")}</p>
            ) : null}
            <p className="text-xs">
              আগ্রহ: {suggestion.interest} · পরামর্শ: {suggestion.nextAction}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={applySuggestion} className="gap-1">
                <Check className="size-3.5" /> মেনে নিন
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAiDecision("edited")}
                className="gap-1"
              >
                <Pencil className="size-3.5" /> নিজে বদলাবো
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAiDecision("rejected")}
                className="gap-1"
              >
                <X className="size-3.5" /> মানছি না
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label className="text-xs">কল ক্যাটাগরি (বাধ্যতামূলক)</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                  category === item.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="call-summary" className="text-xs">
            কলের সারাংশ (বাধ্যতামূলক)
          </Label>
          <Textarea
            id="call-summary"
            rows={3}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="কল-এ কী কথা হলো, সংক্ষেপে"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="follow-when" className="text-xs">
            ফলো-আপের তারিখ ও সময় (বাধ্যতামূলক)
          </Label>
          <Input
            id="follow-when"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </div>

        {reasonRequired ? (
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              কারণ (বাধ্যতামূলক)
            </Label>
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="কেন আগ্রহী নন / নম্বরটি কেন ভুল"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="note" className="text-xs">
            নোট (বাধ্যতামূলক)
          </Label>
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ক্রেতা কী বলেছেন, পরের ধাপ কী"
          />
        </div>

        <Button
          className="w-full"
          disabled={!ready || send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          রিপোর্ট জমা দিন
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          রিপোর্ট জমা না দিলে পরের কল শুরু করা যাবে না।
        </p>
      </DialogContent>
    </Dialog>
  );
}
