import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CreditCard, Loader2, Receipt, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAdminToken } from "@/lib/local-session";
import { getBillingOverview, startServicePayment } from "@/lib/service-billing.functions";
import { formatBdt, INVOICE_STATUS_LABEL } from "@/lib/service-billing";

const STATUS_TONE: Record<string, string> = {
  paid: "bg-live/15 text-live",
  due: "bg-pending/15 text-pending",
  overdue: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

function day(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Executive HQ billing card. Shows only what the business owner needs: the
 * monthly amount, billing date, status, last payment and one Pay/Renew action.
 * No internal allocation, no architect fee, no bank details.
 */
export function ServiceBillingCard() {
  const adminToken = useAdminToken();
  const load = useServerFn(getBillingOverview);
  const pay = useServerFn(startServicePayment);
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ["service-billing", adminToken ? "pin" : "none"],
    queryFn: () => load({ data: { adminToken } }),
    refetchInterval: 120_000,
  });

  const payNow = useMutation({
    mutationFn: () => pay({ data: { adminToken } }),
    onSuccess: (result) => {
      if (result.configured && result.checkoutUrl) {
        window.open(result.checkoutUrl, "_blank", "noopener");
        return;
      }
      toast.info("অনলাইন কার্ড গেটওয়ে এখনো সংযুক্ত নয়", {
        description: `ইনভয়েস রেফারেন্স ${result.reference} — ${formatBdt(result.amount)}. পেমেন্ট হওয়ার পর আইটি কনসোল থেকে যাচাই করে নিশ্চিত করতে হবে।`,
        duration: 8000,
      });
      void queryClient.invalidateQueries({ queryKey: ["service-billing"] });
    },
    onError: (error) =>
      toast.error("পেমেন্ট শুরু করা গেল না", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });

  const data = overview.data;

  return (
    <section className="card-elevated space-y-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> WINSTONE CRM Monthly Service
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            প্রতি মাসের {data?.billingDay ?? 15} তারিখে বিল (ঢাকা সময়)
          </p>
        </div>
        <p className="text-right">
          <span className="text-2xl font-bold tracking-tight">
            {formatBdt(data?.amount ?? 4000)}
          </span>
          <span className="block text-[11px] text-muted-foreground">প্রতি মাস</span>
        </p>
      </header>

      {overview.isLoading ? (
        <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : overview.isError ? (
        <p className="text-sm text-destructive">বিলের তথ্য আনা গেল না।</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="বর্তমান অবস্থা">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[data.current.status] ?? "bg-muted"}`}
              >
                {INVOICE_STATUS_LABEL[data.current.status]}
              </span>
            </Field>
            <Field label="শেষ পেমেন্ট">
              {data.lastPayment
                ? `${formatBdt(data.lastPayment.amount)} · ${day(data.lastPayment.verifiedAt)}`
                : "এখনো কোনো যাচাইকৃত পেমেন্ট নেই"}
            </Field>
            <Field label="পরবর্তী বিলের তারিখ">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                {day(data.nextDueDate)}
              </span>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="h-10 gap-2 rounded-full px-6 font-semibold"
              onClick={() => payNow.mutate()}
              disabled={payNow.isPending}
            >
              {payNow.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CreditCard className="size-4" />
              )}
              PAY / RENEW {formatBdt(data.amount)}
            </Button>
            <span className="text-xs text-muted-foreground">
              {data.serviceActive
                ? `সার্ভিস চালু আছে ${day(data.current.serviceActiveUntil)} পর্যন্ত`
                : data.paymentProvider.configured
                  ? "পেমেন্ট যাচাইয়ের পরেই সার্ভিস সক্রিয় হবে"
                  : data.paymentProvider.message}
            </span>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Receipt className="size-3.5" /> পেমেন্ট ও ইনভয়েস ইতিহাস
            </p>
            {data.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">এখনো কোনো ইনভয়েস নেই।</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3">মাস</th>
                      <th className="py-1.5 pr-3">বিলের তারিখ</th>
                      <th className="py-1.5 pr-3">পরিমাণ</th>
                      <th className="py-1.5 pr-3">অবস্থা</th>
                      <th className="py-1.5">পরিশোধ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((i) => (
                      <tr key={i.reference} className="border-t border-border/60">
                        <td className="py-1.5 pr-3 font-medium">{i.month}</td>
                        <td className="py-1.5 pr-3 tabular">{i.billingDate}</td>
                        <td className="py-1.5 pr-3 tabular">{formatBdt(i.amount)}</td>
                        <td className="py-1.5 pr-3">{INVOICE_STATUS_LABEL[i.status]}</td>
                        <td className="py-1.5 tabular">{day(i.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{children}</p>
    </div>
  );
}
