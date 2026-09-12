import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { aiVoiceStatus, aiVoiceTranscript, updateAiVoice } from "@/lib/ai-voice.functions";
import { getAdminToken } from "@/lib/local-session";

export function AiVoicePanel() {
  const queryClient = useQueryClient();
  const adminToken = getAdminToken();

  const fetchStatus = useServerFn(aiVoiceStatus);
  const fetchTranscript = useServerFn(aiVoiceTranscript);
  const save = useServerFn(updateAiVoice);

  const [greeting, setGreeting] = useState("");
  const [openSession, setOpenSession] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["ai-voice-status", adminToken],
    queryFn: () => fetchStatus({ data: { adminToken } }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (status.data?.settings.greeting) setGreeting(status.data.settings.greeting);
  }, [status.data?.settings.greeting]);

  const transcript = useQuery({
    queryKey: ["ai-voice-transcript", openSession],
    queryFn: () => fetchTranscript({ data: { adminToken, sessionRowId: openSession! } }),
    enabled: Boolean(openSession),
  });

  const mutation = useMutation({
    mutationFn: (patch: { enabled?: boolean; greeting?: string; handoffEnabled?: boolean }) =>
      save({ data: { adminToken, ...patch } }),
    onSuccess: () => {
      toast.success("সেভ হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["ai-voice-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = status.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Bot className="size-4 text-primary" /> লাইভ AI ভয়েস সহকারী
        </CardTitle>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => void status.refetch()}>
          <RefreshCw className="size-3.5" /> রিফ্রেশ
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {!data ? (
          <p className="text-muted-foreground">তথ্য আসছে…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div>
                <p className="font-medium">ইনকামিং কলে AI কথা বলবে</p>
                <p className="text-xs text-muted-foreground">
                  চালু করলে Twilio নম্বরে আসা কল প্রথমে AI ধরবে, দরকার হলে এজেন্টের কাছে দিয়ে দেবে।
                </p>
              </div>
              <Switch
                checked={data.settings.enabled}
                disabled={mutation.isPending}
                onCheckedChange={(checked) => mutation.mutate({ enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <p className="font-medium">গ্রাহক চাইলে মানুষের কাছে হস্তান্তর</p>
              <Switch
                checked={data.settings.handoffEnabled}
                disabled={mutation.isPending}
                onCheckedChange={(checked) => mutation.mutate({ handoffEnabled: checked })}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">প্রথম কথা</p>
              <Textarea
                value={greeting}
                onChange={(event) => setGreeting(event.target.value)}
                rows={2}
                className="text-sm"
              />
              <Button
                size="sm"
                className="h-7"
                disabled={mutation.isPending || greeting.trim().length < 4}
                onClick={() => mutation.mutate({ greeting: greeting.trim() })}
              >
                {mutation.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : null} সেভ করুন
              </Button>
            </div>

            {!data.aiKeyPresent && (
              <p className="text-xs text-destructive">AI সংযোগ নেই — এখন AI কথা বলতে পারবে না।</p>
            )}
            {!data.websocketUrl && (
              <p className="text-xs text-destructive">
                পাবলিক ঠিকানা সেট নেই, তাই Twilio AI-এর সাথে যুক্ত হতে পারবে না।
              </p>
            )}
            {data.websocketUrl && (
              <p className="break-all rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
                {data.websocketUrl}
              </p>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">সাম্প্রতিক AI কল</p>
              {data.sessions.length === 0 ? (
                <p className="text-muted-foreground">এখনো কোনো AI কল হয়নি।</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.sessions.map((s) => (
                    <li key={s.id} className="rounded-md border border-border px-2.5 py-2">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => setOpenSession(openSession === s.id ? null : s.id)}
                      >
                        <span className="font-mono text-xs">{s.from_number ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.status} · {s.turn_count} কথা
                        </span>
                      </button>
                      {openSession === s.id && (
                        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                          {transcript.isLoading && <p className="text-muted-foreground">লোড হচ্ছে…</p>}
                          {(transcript.data ?? []).map((turn) => (
                            <p key={turn.id}>
                              <span className="text-muted-foreground">
                                {turn.role === "customer" ? "গ্রাহক" : turn.role === "assistant" ? "AI" : "সিস্টেম"}:
                              </span>{" "}
                              {turn.content}
                            </p>
                          ))}
                          {s.error_message && <p className="text-destructive">{s.error_message}</p>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
