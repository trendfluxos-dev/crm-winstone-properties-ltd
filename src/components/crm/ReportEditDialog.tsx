import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABEL_CLIENT } from "@/lib/call-categories";
import { editMyReport } from "@/lib/call-reports.functions";
import { getAdminToken } from "@/lib/local-session";

export type EditableReport = {
  id: string;
  category: string | null;
  summary: string | null;
  note: string | null;
  reason: string | null;
  follow_up_at: string | null;
  connected: boolean;
  temperature: string | null;
  grade: string | null;
  lead: { name: string; phone_number: string } | null;
};

/** Turns an ISO instant into the value a datetime-local input expects. */
function localValue(iso: string | null) {
  if (!iso) return "";
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * Correction sheet for an update the agent already submitted. Available only
 * inside the 09:00–12:45 window; the server checks the window again.
 */
export function ReportEditDialog({
  report,
  open,
  onOpenChange,
}: {
  report: EditableReport | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(editMyReport);
  const [category, setCategory] = useState(report?.category ?? "");
  const [summary, setSummary] = useState(report?.summary ?? "");
  const [note, setNote] = useState(report?.note ?? "");
  const [reason, setReason] = useState(report?.reason ?? "");
  const [followUp, setFollowUp] = useState(localValue(report?.follow_up_at ?? null));
  const [temperature, setTemperature] = useState(report?.temperature ?? "");
  const [grade, setGrade] = useState(report?.grade ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          adminToken: getAdminToken(),
          reportId: report!.id,
          category,
          summary,
          note,
          reason: reason || null,
          followUpAt: followUp ? new Date(followUp).toISOString() : null,
          temperature: (temperature || null) as "hot" | "warm" | "cold" | null,
          grade: (grade || null) as "A" | "B" | "C" | "D" | null,
        },
      }),
    onSuccess: () => {
      toast.success("রিপোর্ট হালনাগাদ হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["my-call-reports"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>রিপোর্ট সংশোধন</DialogTitle>
          <DialogDescription>
            {report.lead?.name ?? "লিড"} · {report.lead?.phone_number ?? ""} — সকাল ৯:০০ থেকে ১২:৪৫
            পর্যন্ত নিজের দেওয়া তথ্য বদলানো যায়।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>কল ক্যাটাগরি</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(CATEGORY_LABEL_CLIENT).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={category === key ? "default" : "outline"}
                  className="justify-start text-xs"
                  onClick={() => setCategory(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-summary">কলের সারাংশ</Label>
            <Textarea
              id="edit-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-note">নোট</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-reason">কারণ (আগ্রহী নয় / ভুল নম্বর হলে)</Label>
            <Input id="edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-follow">ফলো-আপের তারিখ ও সময়</Label>
            <Input
              id="edit-follow"
              type="datetime-local"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>

          {report.connected && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>শ্রেণিবিন্যাস</Label>
                <div className="flex gap-1.5">
                  {["hot", "warm", "cold"].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={temperature === value ? "default" : "outline"}
                      onClick={() => setTemperature(value)}
                    >
                      {value.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>গ্রেড</Label>
                <div className="flex gap-1.5">
                  {["A", "B", "C", "D"].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={grade === value ? "default" : "outline"}
                      onClick={() => setGrade(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <Button
          className="w-full"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          সংশোধন জমা দিন
        </Button>
      </DialogContent>
    </Dialog>
  );
}
