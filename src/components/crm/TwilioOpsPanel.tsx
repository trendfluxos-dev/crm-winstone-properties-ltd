import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, PhoneCall, RefreshCw, ShieldOff, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buyTwilioNumber,
  complianceList,
  listTwilioNumbers,
  searchTwilioNumbers,
  upsertDoNotContact,
  webhookHealth,
  wireTwilioNumber,
} from "@/lib/comms-admin.functions";
import { getAdminToken } from "@/lib/local-session";

export function TwilioOpsPanel() {
  const queryClient = useQueryClient();
  const adminToken = getAdminToken();

  const fetchNumbers = useServerFn(listTwilioNumbers);
  const fetchWebhooks = useServerFn(webhookHealth);
  const fetchCompliance = useServerFn(complianceList);
  const wire = useServerFn(wireTwilioNumber);
  const search = useServerFn(searchTwilioNumbers);
  const buy = useServerFn(buyTwilioNumber);
  const blockPhone = useServerFn(upsertDoNotContact);

  const [country, setCountry] = useState("US");
  const [dncPhone, setDncPhone] = useState("");

  const numbers = useQuery({
    queryKey: ["twilio-numbers", adminToken],
    queryFn: () => fetchNumbers({ data: { adminToken } }),
  });
  const webhooks = useQuery({
    queryKey: ["twilio-webhooks", adminToken],
    queryFn: () => fetchWebhooks({ data: { adminToken } }),
    refetchInterval: 60_000,
  });
  const compliance = useQuery({
    queryKey: ["comms-compliance", adminToken],
    queryFn: () => fetchCompliance({ data: { adminToken } }),
  });

  const searchMutation = useMutation({
    mutationFn: () => search({ data: { adminToken, country: country.toUpperCase() } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const wireMutation = useMutation({
    mutationFn: (sid: string) => wire({ data: { adminToken, sid } }),
    onSuccess: () => {
      toast.success("নম্বরের ওয়েবহুক CRM-এ সেট হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["twilio-numbers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const buyMutation = useMutation({
    mutationFn: (phoneNumber: string) => buy({ data: { adminToken, phoneNumber } }),
    onSuccess: (bought) => {
      toast.success(`${bought.phoneNumber} কেনা হয়েছে`);
      searchMutation.reset();
      void queryClient.invalidateQueries({ queryKey: ["twilio-numbers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dncMutation = useMutation({
    mutationFn: (input: { phoneNumber: string; remove: boolean }) =>
      blockPhone({ data: { adminToken, phoneNumber: input.phoneNumber, channel: "all", remove: input.remove } }),
    onSuccess: () => {
      setDncPhone("");
      void queryClient.invalidateQueries({ queryKey: ["comms-compliance"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const numberData = numbers.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <PhoneCall className="size-4 text-primary" /> Twilio নম্বর ও কমপ্লায়েন্স
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2"
          onClick={() => {
            void numbers.refetch();
            void webhooks.refetch();
            void compliance.refetch();
          }}
        >
          <RefreshCw className="size-3.5" /> রিফ্রেশ
        </Button>
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">অ্যাকাউন্টের নম্বর</h3>
          {numbers.isLoading ? (
            <p className="text-muted-foreground">Twilio থেকে আসছে…</p>
          ) : numberData?.error ? (
            <p className="text-destructive">{numberData.error}</p>
          ) : numberData && numberData.numbers.length === 0 ? (
            <p className="text-muted-foreground">এখনো কোনো নম্বর কেনা হয়নি।</p>
          ) : (
            <ul className="space-y-2">
              {numberData?.numbers.map((n) => (
                <li key={n.sid} className="rounded-md border border-border px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{n.phoneNumber}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <Flag ok={n.voiceWired} label="Voice" />
                      <Flag ok={n.statusWired} label="Status" />
                      <Flag ok={n.smsWired} label="SMS" />
                    </div>
                  </div>
                  {(!n.voiceWired || !n.statusWired || !n.smsWired) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7"
                      disabled={wireMutation.isPending}
                      onClick={() => wireMutation.mutate(n.sid)}
                    >
                      {wireMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : null} CRM-এ যুক্ত করুন
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">নতুন নম্বর কেনা</h3>
          <div className="flex items-center gap-2">
            <Input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="h-8 w-20 font-mono text-xs"
              maxLength={2}
              aria-label="দেশের কোড"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={searchMutation.isPending}
              onClick={() => searchMutation.mutate()}
            >
              {searchMutation.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : null} খুঁজুন
            </Button>
          </div>
          {searchMutation.data && searchMutation.data.length > 0 && (
            <ul className="space-y-1.5">
              {searchMutation.data.map((available) => (
                <li
                  key={available.phoneNumber}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                >
                  <span className="font-mono text-xs">{available.friendlyName}</span>
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={buyMutation.isPending}
                    onClick={() => buyMutation.mutate(available.phoneNumber)}
                  >
                    কিনুন
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            কেনা মানে Twilio অ্যাকাউন্ট থেকে আসল টাকা কাটবে; কেনার পরেই ওয়েবহুক নিজে থেকে সেট হয়ে যায়।
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ওয়েবহুক ডেলিভারি</h3>
          {webhooks.data ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Pill label="গৃহীত" value={webhooks.data.counts.received} />
                <Pill label="সম্পন্ন" value={webhooks.data.counts.processed} />
                <Pill label="ব্যর্থ" value={webhooks.data.counts.failed} />
                <Pill label="বাতিল" value={webhooks.data.counts.rejected} />
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {webhooks.data.recent.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono">{row.event_type}</span>
                    <span className="text-muted-foreground">
                      {row.status} · {row.attempts}x
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">তথ্য আসছে…</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            যাদের কল/মেসেজ করা যাবে না
          </h3>
          <div className="flex items-center gap-2">
            <Input
              value={dncPhone}
              onChange={(event) => setDncPhone(event.target.value)}
              placeholder="01XXXXXXXXX"
              className="h-8 font-mono text-xs"
              aria-label="ফোন নম্বর"
            />
            <Button
              size="sm"
              variant="destructive"
              className="h-8"
              disabled={!dncPhone.trim() || dncMutation.isPending}
              onClick={() => dncMutation.mutate({ phoneNumber: dncPhone.trim(), remove: false })}
            >
              <ShieldOff className="mr-1 size-3" /> বন্ধ করুন
            </Button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {(compliance.data?.doNotContact ?? []).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono">{row.phone_number}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{row.channel}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    disabled={dncMutation.isPending}
                    onClick={() => dncMutation.mutate({ phoneNumber: row.phone_number, remove: true })}
                  >
                    তুলে নিন
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {ok ? <CheckCircle2 className="size-3.5 text-live" /> : <XCircle className="size-3.5 text-destructive" />}
      {label}
    </span>
  );
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5">
      {label}: {value}
    </span>
  );
}
