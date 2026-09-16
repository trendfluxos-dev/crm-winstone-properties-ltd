import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Banknote, CheckCircle2, Landmark, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminToken } from "@/lib/local-session";
import {
  getBillingControl,
  saveArchitectProfile,
  updateArchitectPayout,
  verifyManualPayment,
} from "@/lib/service-billing.functions";
import {
  ALLOCATION_ARCHITECT,
  ALLOCATION_SYSTEM,
  formatBdt,
  PAYOUT_STATUS_LABEL,
  type PayoutStatus,
} from "@/lib/service-billing";

/**
 * IT Console billing control: payment verification, provider health, internal
 * allocation, architect payable and payout lifecycle. Only reachable with the
 * full IT Console token — Executive HQ's read-only token cannot open it.
 */
export function BillingControlPanel() {
  const adminToken = useAdminToken();
  const load = useServerFn(getBillingControl);
  const verify = useServerFn(verifyManualPayment);
  const saveProfile = useServerFn(saveArchitectProfile);
  const setPayout = useServerFn(updateArchitectPayout);
  const queryClient = useQueryClient();

  const control = useQuery({
    queryKey: ["billing-control", adminToken ? "pin" : "none"],
    queryFn: () => load({ data: { adminToken } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["billing-control"] });

  const [txn, setTxn] = useState("");
  const [amount, setAmount] = useState("4000");
  const [channel, setChannel] = useState("manual_bank_transfer");
  const [reference, setReference] = useState("");

  const manual = useMutation({
    mutationFn: () =>
      verify({
        data: {
          adminToken,
          reference: channel,
          providerTxnId: txn,
          amount: Number(amount),
        },
      }),
    onSuccess: (r) => {
      if (r.duplicate) toast.info("এই লেনদেন আগেই প্রক্রিয়া হয়েছে");
      else if (r.accepted) toast.success("পেমেন্ট যাচাই হয়েছে — সার্ভিস সক্রিয়");
      else toast.error("গ্রহণ করা হয়নি", { description: r.reason ?? undefined });
      setTxn("");
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["service-billing"] });
    },
    onError: (e) =>
      toast.error("যাচাই ব্যর্থ", { description: e instanceof Error ? e.message : undefined }),
  });

  const payoutMove = useMutation({
    mutationFn: (input: { payoutId: string; status: PayoutStatus }) =>
      setPayout({
        data: {
          adminToken,
          payoutId: input.payoutId,
          status: input.status,
          providerReference: input.status === "paid" ? reference : null,
        },
      }),
    onSuccess: () => {
      toast.success("পেআউট অবস্থা হালনাগাদ");
      setReference("");
      void refresh();
    },
    onError: (e) =>
      toast.error("বদলানো গেল না", { description: e instanceof Error ? e.message : undefined }),
  });

  const data = control.data;
  const profile = data?.profile ?? null;

  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [branch, setBranch] = useState("");
  const [account, setAccount] = useState("");
  const [routing, setRouting] = useState("");

  const profileSave = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          adminToken,
          beneficiaryName: name || (profile?.beneficiaryName ?? ""),
          bankName: bank || (profile?.bankName ?? ""),
          branchName: branch || profile?.branchName || null,
          accountNumber: account || null,
          routingNumber: routing || profile?.routingNumber || null,
        },
      }),
    onSuccess: () => {
      toast.success("আর্কিটেক্ট পেআউট প্রোফাইল সংরক্ষিত");
      setAccount("");
      void refresh();
    },
    onError: (e) =>
      toast.error("সংরক্ষণ ব্যর্থ", { description: e instanceof Error ? e.message : undefined }),
  });

  return (
    <section className="card-elevated space-y-5 p-4">
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4 text-primary" /> বিলিং কন্ট্রোল
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          মাসিক সার্ভিস ৳৪,০০০ — অভ্যন্তরীণ ভাগ, পেমেন্ট যাচাই ও আর্কিটেক্ট পেআউট। শুধু আইটি
          কনসোলে দেখা যায়।
        </p>
      </header>

      {control.isLoading ? (
        <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : control.isError ? (
        <p className="text-sm text-destructive">তথ্য আনা গেল না — মাস্টার পিন লাগবে।</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Health
              ok={data.paymentProvider.configured}
              title="পেমেন্ট প্রোভাইডার"
              message={data.paymentProvider.message}
            />
            <Health
              ok={data.payoutProvider.configured}
              title="পেআউট প্রোভাইডার"
              message={data.payoutProvider.message}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Tile label="System / Infrastructure" value={formatBdt(ALLOCATION_SYSTEM)} />
            <Tile label="Architect Maintenance Fee" value={formatBdt(ALLOCATION_ARCHITECT)} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              পেমেন্ট যাচাই (ব্যাংক / ম্যানুয়াল)
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-9 w-44"
                placeholder="চ্যানেল"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              />
              <Input
                className="h-9 w-56"
                placeholder="লেনদেন রেফারেন্স"
                value={txn}
                onChange={(e) => setTxn(e.target.value)}
              />
              <Input
                className="h-9 w-28"
                placeholder="টাকা"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                className="h-9"
                onClick={() => manual.mutate()}
                disabled={manual.isPending || !txn.trim()}
              >
                {manual.isPending ? <Loader2 className="size-4 animate-spin" /> : "যাচাই করে সক্রিয় করুন"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              যাচাই সার্ভারে হয় এবং অডিটে লেখা থাকে। একই রেফারেন্স দ্বিতীয়বার দিলে কিছু দ্বিগুণ হবে
              না।
            </p>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Landmark className="size-3.5" /> আর্কিটেক্ট পেআউট প্রোফাইল
            </p>
            {profile ? (
              <p className="text-sm">
                {profile.beneficiaryName} · {profile.bankName}
                {profile.branchName ? ` · ${profile.branchName}` : ""} ·{" "}
                <span className="tabular">{profile.accountMasked ?? "অ্যাকাউন্ট নম্বর নেই"}</span> ·
                রাউটিং: {profile.routingNumber ?? "এখনো দেওয়া হয়নি"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">প্রোফাইল এখনো তৈরি হয়নি।</p>
            )}
            {!data.encryptionConfigured && (
              <p className="text-xs text-destructive">
                এনক্রিপশন কী সেট নেই — অ্যাকাউন্ট নম্বর সংরক্ষণ করা যাবে না।
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-9 w-48"
                placeholder={profile?.beneficiaryName ?? "নাম"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                className="h-9 w-40"
                placeholder={profile?.bankName ?? "ব্যাংক"}
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
              <Input
                className="h-9 w-44"
                placeholder={profile?.branchName ?? "শাখা"}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
              <Input
                className="h-9 w-48"
                placeholder="অ্যাকাউন্ট নম্বর (এনক্রিপ্ট হবে)"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              />
              <Input
                className="h-9 w-40"
                placeholder="রাউটিং নম্বর (যাচাই হলে)"
                value={routing}
                onChange={(e) => setRouting(e.target.value)}
              />
              <Button
                variant="outline"
                className="h-9"
                onClick={() => profileSave.mutate()}
                disabled={profileSave.isPending}
              >
                সংরক্ষণ
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Banknote className="size-3.5" /> আর্কিটেক্ট পেআউট (৳১,০০০ প্রতি পরিশোধিত মাস)
            </p>
            {data.payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">এখনো কোনো পেআউট আইটেম নেই।</p>
            ) : (
              <div className="space-y-2">
                <Input
                  className="h-9 w-64"
                  placeholder="ব্যাংক নিশ্চিতকরণ রেফারেন্স (PAID-এর জন্য)"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                {data.payouts.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{p.invoiceMonth ?? "—"}</span>
                    <span className="tabular">{formatBdt(p.amount)}</span>
                    <span className="rounded-full bg-card px-2 py-0.5 text-xs">
                      {PAYOUT_STATUS_LABEL[p.status]}
                    </span>
                    {p.providerReference && (
                      <span className="text-xs text-muted-foreground">{p.providerReference}</span>
                    )}
                    <span className="ml-auto flex gap-1.5">
                      {(["approved", "ready", "paid", "failed", "cancelled"] as PayoutStatus[]).map(
                        (next) => (
                          <Button
                            key={next}
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => payoutMove.mutate({ payoutId: p.id, status: next })}
                            disabled={payoutMove.isPending}
                          >
                            {PAYOUT_STATUS_LABEL[next]}
                          </Button>
                        ),
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.allocations.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                অভ্যন্তরীণ বরাদ্দের ইতিহাস
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {data.allocations.map((a, i) => (
                      <tr key={`${a.month}-${a.kind}-${i}`} className="border-t border-border/60">
                        <td className="py-1.5 pr-3">{a.month}</td>
                        <td className="py-1.5 pr-3">{a.label}</td>
                        <td className="py-1.5 tabular">{formatBdt(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function Health({ ok, title, message }: { ok: boolean; title: string; message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 text-live" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 text-pending" />
      )}
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{message}</span>
      </span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular">{value}</p>
    </div>
  );
}
