import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Phone, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminToken } from "@/lib/local-session";
import { twilioHealth } from "@/lib/twilio.functions";

export function TwilioStatusCard() {
  const queryClient = useQueryClient();
  const fetchHealth = useServerFn(twilioHealth);
  const health = useQuery({
    queryKey: ["twilio-health", getAdminToken()],
    queryFn: () => fetchHealth({ data: { adminToken: getAdminToken() } }),
    refetchInterval: 60_000,
  });

  const data = health.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Phone className="size-4 text-primary" /> Twilio কল ইন্টিগ্রেশন
        </CardTitle>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => void health.refetch()}>
          <RefreshCw className="size-3.5" /> রিফ্রেশ
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data ? (
          <p className="text-muted-foreground">তথ্য আসছে…</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {data.configured ? (
                <>
                  <CheckCircle2 className="size-4 text-live" />
                  <span className="font-medium">সংযুক্ত</span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-destructive" />
                  <span className="font-medium">কনফিগার করা হয়নি</span>
                </>
              )}
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <StatusRow label="API Key" ok={data.hasApiKey} />
              <StatusRow label="Account SID" ok={data.hasAccountSid} />
              <StatusRow label="Auth Token" ok={data.hasAuthToken} />
              <StatusRow label="Phone Number" ok={data.hasPhoneNumber} value={data.phoneNumber ?? undefined} />
            </dl>

            {data.recordingEnabled ? (
              <p className="text-xs text-muted-foreground">
                রেকর্ডিং চালু আছে। ঘোষণা: {data.consentNotice}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">রেকর্ডিং বন্ধ আছে (consent notice off)।</p>
            )}

            <div className="space-y-2 pt-2">
              <WebhookRow label="Voice URL" value={data.voiceUrl} />
              <WebhookRow label="Status Callback" value={data.statusUrl} />
              <WebhookRow label="Recording Callback" value={data.recordingUrl} />
              <WebhookRow label="WhatsApp Webhook" value={data.whatsappUrl} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value?: string | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {value && <span className="max-w-[140px] truncate font-mono text-xs">{value}</span>}
        {ok ? <CheckCircle2 className="size-4 text-live" /> : <ShieldAlert className="size-4 text-idle" />}
      </div>
    </div>
  );
}

function WebhookRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="max-w-[220px] truncate font-mono text-xs">{value}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("কপি করা হয়েছে");
          }}
        >
          <Copy className="size-3" />
        </Button>
      </div>
    </div>
  );
}
