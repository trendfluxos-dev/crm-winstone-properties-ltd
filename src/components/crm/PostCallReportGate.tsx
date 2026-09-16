import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DictateButton } from "@/components/crm/DictateButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { myPendingReport, submitMyReport } from "@/lib/call-reports.functions";
import { useAdminToken } from "@/lib/local-session";
import { enqueue, subscribeQueue } from "@/lib/offline-queue";
import { draftReportSummary } from "@/lib/report-summary.functions";

/** Adds dictated words to what the agent already typed — never erases it. */
function joinText(previous: string, addition: string): string {
  return previous.trim() ? `${previous.trim()} ${addition}` : addition;
}


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

/**
 * Ready-made note lines agents can tap instead of typing. They are appended to
 * whatever the agent already wrote — nothing is ever replaced or auto-filled.
 */
const NOTE_SUGGESTIONS: Record<string, string[]> = {
  hot_lead: [
    "বাজেট ঠিক আছে, দ্রুত সিদ্ধান্ত নিতে চান।",
    "ভিজিটে আগ্রহী — সময় ঠিক করতে হবে।",
    "ফ্ল্যাটের ব্রোশিওর/প্রাইস পাঠাতে বলেছেন।",
  ],
  follow_up: [
    "এখন ব্যস্ত, পরে কল করতে বলেছেন।",
    "পরিবারের সাথে আলোচনা করে জানাবেন।",
    "পরের সপ্তাহে আবার যোগাযোগ করতে বলেছেন।",
  ],
  interested: [
    "প্রজেক্ট সম্পর্কে বিস্তারিত জানতে চেয়েছেন।",
    "লোকেশন পছন্দ হয়েছে, দাম নিয়ে ভাবছেন।",
    "পেমেন্ট/কিস্তির সুবিধা জানতে চেয়েছেন।",
  ],
  not_interested: [
    "এখন ফ্ল্যাট কেনার পরিকল্পনা নেই।",
    "বাজেটের সাথে মিলছে না।",
    "অন্য জায়গায় ইতিমধ্যে কিনে ফেলেছেন।",
  ],
  callback: [
    "নির্দিষ্ট সময়ে কলব্যাক চেয়েছেন।",
    "মিটিংয়ে আছেন, পরে কথা বলবেন।",
  ],
  no_answer: [
    "রিং হয়েছে, কেউ ধরেননি।",
    "নম্বর বন্ধ/নেটওয়ার্কের বাইরে।",
    "পরে আবার চেষ্টা করতে হবে।",
  ],
  wrong_number: [
    "এই নম্বর অন্য ব্যক্তির।",
    "নম্বরটি আর ব্যবহৃত হয় না।",
  ],
  closed_converted: [
    "বুকিং নিশ্চিত হয়েছে।",
    "পেমেন্ট প্রক্রিয়া শুরু হয়েছে।",
  ],
};

const GENERAL_NOTE_SUGGESTIONS = [
  "হোয়াটসঅ্যাপে তথ্য পাঠানো হয়েছে।",
  "অফিস ভিজিটের জন্য আমন্ত্রণ জানানো হয়েছে।",
  "পরবর্তী ধাপ: ফলো-আপ কল।",
];

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
  const [noFollowUp, setNoFollowUp] = useState(false);
  const [temperature, setTemperature] = useState<"hot" | "warm" | "cold" | null>(null);
  const [grade, setGrade] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [aiDecision, setAiDecision] = useState<"accepted" | "edited" | "rejected" | null>(null);
  const [smart, setSmart] = useState<string | null>(null);
  const [smartBusy, setSmartBusy] = useState(false);

  const detail = pending.data;
  const suggestion = detail?.suggestion ?? null;

  // Reports already saved on this phone (waiting for sync) must not keep the
  // gate open — the work is done from the agent's side, the queue owns the rest.
  const [queuedReportIds, setQueuedReportIds] = useState<string[]>([]);
  useEffect(
    () =>
      subscribeQueue((items) =>
        setQueuedReportIds(
          items
            .filter((item) => item.kind === "report_submit")
            .map((item) => String(item.payload["reportId"] ?? "")),
        ),
      ),
    [],
  );

  useEffect(() => {
    if (!detail) {
      setCategory("");
      setSummary("");
      setNote("");
      setReason("");
      setWhen("");
      setNoFollowUp(false);
      setTemperature(null);
      setGrade(null);
      setAiDecision(null);
      setSmart(null);
    }
  }, [detail?.report?.id, detail]);

  // Smart summary from the agent's own words — no transcript needed. Debounced,
  // so a long note costs one short AI call after the agent pauses, not one per key.
  const draft = useServerFn(draftReportSummary);
  const lastAsked = useRef("");
  useEffect(() => {
    if (!detail) return;
    const text = `${summary}\n${note}`.trim();
    if (text.length < 40 || text === lastAsked.current) return;
    const timer = window.setTimeout(() => {
      lastAsked.current = text;
      setSmartBusy(true);
      draft({ data: { adminToken, text, category: category || null } })
        .then((result) => setSmart(result.summary))
        .catch(() => setSmart(null))
        .finally(() => setSmartBusy(false));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [summary, note, category, detail, adminToken, draft]);

  const payloadOf = () => ({
    adminToken,
    reportId: detail!.report.id,
    category,
    summary: summary.trim() || null,
    note: note.trim() || null,
    reason: reason.trim() || null,
    followUpAt: !noFollowUp && when ? new Date(when).toISOString() : null,
    reminderMinutes: 30,
    temperature,
    grade,
    aiDecision,
  });

  const send = useMutation({
    mutationFn: async () => {
      const payload = payloadOf();
      // No internet: keep it on this phone, honestly labelled, and sync later.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueue("report_submit", `কল রিপোর্ট (${detail!.lead?.name ?? "লিড"})`, {
          ...payload,
          clientEventId: `report-${detail!.report.id}`,
        });
        return { offline: true as const };
      }
      await submit({ data: payload });
      return { offline: false as const };
    },
    onSuccess: (result) => {
      toast.success(
        result.offline
          ? "ইন্টারনেট নেই — রিপোর্ট এই ফোনে সেভ হয়েছে, নেট ফিরলে নিজেই সার্ভারে যাবে"
          : "রিপোর্ট জমা হয়েছে — পরের লিড খুলে গেল",
      );
      void queryClient.invalidateQueries({ queryKey: ["pending-call-report"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!detail || queuedReportIds.includes(detail.report.id)) return null;

  const reasonRequired = NEEDS_REASON.has(category);
  // The customer answered -> classification (Hot/Warm/Cold + A/B/C/D) is what
  // turns the lead into COMPLETED. Not answered -> the lead goes back to retry.
  const received = detail.report.connected !== false;
  // Category + summary + note are mandatory. Follow-up is OPTIONAL: the agent
  // either picks a date or explicitly says no follow-up is needed.
  const ready =
    Boolean(category) &&
    summary.trim().length > 1 &&
    note.trim().length > 1 &&
    (noFollowUp || Boolean(when)) &&
    (!received || (Boolean(temperature) && Boolean(grade))) &&
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
    // AI never overwrites a classification the agent already picked.
    if (!temperature && suggestion.suggestedTemperature)
      setTemperature(suggestion.suggestedTemperature);
    if (!grade && suggestion.suggestedGrade) setGrade(suggestion.suggestedGrade);
    setAiDecision("accepted");
  };

  return (
    <Dialog open>
      <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-none p-4 pb-8 sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:p-6">
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
            {suggestion.suggestedTemperature || suggestion.suggestedGrade ? (
              <p className="text-xs">
                পরামর্শ শ্রেণি:{" "}
                {suggestion.suggestedTemperature
                  ? { hot: "হট", warm: "ওয়ার্ম", cold: "কোল্ড" }[suggestion.suggestedTemperature]
                  : "—"}{" "}
                · গ্রেড {suggestion.suggestedGrade ?? "—"}
              </p>
            ) : null}
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

        {received ? (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs font-bold">শ্রেণিবিন্যাস (বাধ্যতামূলক — কথা হয়েছে)</p>
            <div className="space-y-1.5">
              <Label className="text-xs">লিডের তাপমাত্রা</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {TEMPERATURES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTemperature(item.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      temperature === item.value
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
              <Label className="text-xs">গ্রেড</Label>
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setGrade(item.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                      grade === item.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              শ্রেণিবিন্যাস ছাড়া লিড COMPLETED হবে না। AI নিজে থেকে এটি বসাবে না।
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            কথা হয়নি — লিড PENDING থাকবে এবং আবার কলের তালিকায় ফিরে যাবে।
          </p>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="call-summary" className="text-xs">
              কলের সারাংশ (বাধ্যতামূলক)
            </Label>
            <DictateButton onAppend={(text) => setSummary((prev) => joinText(prev, text))} />
          </div>
          <Textarea
            id="call-summary"
            rows={3}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="কল-এ কী কথা হলো, সংক্ষেপে"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="note" className="text-xs">
              নোট (বাধ্যতামূলক)
            </Label>
            <DictateButton onAppend={(text) => setNote((prev) => joinText(prev, text))} />
          </div>
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ক্রেতা কী বলেছেন, পরের ধাপ কী"
          />
        </div>

        {smartBusy || smart ? (
          <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Sparkles className="size-3.5" /> আপনার লেখা থেকে সাজানো সারাংশ
            </p>
            {smartBusy ? (
              <p className="text-xs text-muted-foreground">তৈরি হচ্ছে…</p>
            ) : (
              <>
                <p className="whitespace-pre-line text-xs text-muted-foreground">{smart}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    setSummary(smart ?? "");
                    toast.success("সারাংশে বসানো হয়েছে — দরকার হলে বদলে নিন");
                  }}
                >
                  সারাংশে বসান
                </Button>
              </>
            )}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="follow-when" className="text-xs">
            ফলো-আপের তারিখ ও সময়
          </Label>
          <Input
            id="follow-when"
            type="datetime-local"
            value={when}
            disabled={noFollowUp}
            onChange={(event) => setWhen(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5"
              checked={noFollowUp}
              onChange={(event) => {
                setNoFollowUp(event.target.checked);
                if (event.target.checked) setWhen("");
              }}
            />
            ফলো-আপ দরকার নেই
          </label>
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
