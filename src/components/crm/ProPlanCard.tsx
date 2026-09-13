import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CreditCard, Loader2, Minus, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPaddleEnvironment,
  getPaddlePriceId,
  initializePaddle,
  PRO_PRICE_ID,
  PRO_PRICE_LABEL,
  PRO_PRICE_SUFFIX,
} from "@/lib/paddle";
import { getLicenseStatus, openBillingPortal } from "@/lib/payments.functions";
import { useAdminToken } from "@/lib/local-session";

export function useLicense() {
  return useQuery({
    queryKey: ["license", getPaddleEnvironment()],
    queryFn: () => getLicenseStatus({ data: { environment: getPaddleEnvironment() } }),
    refetchInterval: 60_000,
  });
}

/**
 * Winstone Connect Pro checkout card. Opens the Paddle overlay with a seat
 * quantity; authority PIN holders can also open the billing portal.
 */
export function ProPlanCard({ compact = false }: { compact?: boolean }) {
  const adminToken = useAdminToken();
  const license = useLicense();
  const queryClient = useQueryClient();
  const [seats, setSeats] = useState(6);
  const [busy, setBusy] = useState(false);
  const isSandbox = getPaddleEnvironment() === "sandbox";

  const startCheckout = async () => {
    setBusy(true);
    try {
      await initializePaddle();
      const priceId = await getPaddlePriceId(PRO_PRICE_ID);
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: seats }],
        settings: { displayMode: "overlay", theme: "light" },
      });
      // Paddle fires no promise on completion — refresh the licence shortly after opening.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["license"] }), 20_000);
      toast.info(
        isSandbox ? "Test checkout opened — no real money moves." : "Secure checkout opened",
      );
    } catch (error) {
      toast.error("Could not open checkout", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const manageBilling = async () => {
    if (!adminToken) {
      toast.error("Master PIN required to manage billing");
      return;
    }
    setBusy(true);
    try {
      const { url } = await openBillingPortal({
        data: { adminToken, environment: getPaddleEnvironment() },
      });
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error("Billing portal unavailable", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const lic = license.data;
  const periodEnd = lic?.currentPeriodEnd
    ? new Date(lic.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="card-elevated p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BadgeCheck className="size-4 text-primary" /> Winstone Connect Pro
            {isSandbox && (
              <span className="rounded-full bg-pending/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pending">
                Test mode
              </span>
            )}
          </p>
          {!compact && (
            <p className="mt-1 text-xs text-muted-foreground">
              Full CRM per agent seat: lead workspace, call &amp; WhatsApp logs, AI Copilot, AI
              Coach and realtime analytics.
            </p>
          )}
        </div>
        <p className="text-right">
          <span className="text-xl font-bold tracking-tight">{PRO_PRICE_LABEL}</span>
          <span className="block text-[11px] text-muted-foreground">{PRO_PRICE_SUFFIX}</span>
        </p>
      </div>

      {lic?.active ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-live/10 px-3 py-2.5 text-sm">
          <span className="flex items-center gap-2 font-semibold text-live">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-live" />
            </span>
            Plan active — {lic.seats} seat{lic.seats === 1 ? "" : "s"}
          </span>
          {periodEnd && (
            <span className="text-xs text-muted-foreground">
              {lic.cancelAtPeriodEnd ? "Access until" : "Renews"} {periodEnd}
            </span>
          )}
          {adminToken && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1.5"
              onClick={manageBilling}
              disabled={busy}
            >
              <Settings2 className="size-3.5" /> Manage billing
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1">
            <button
              type="button"
              aria-label="Fewer seats"
              className="grid size-7 place-items-center rounded-full transition-colors hover:bg-card disabled:opacity-40"
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats <= 1}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-14 text-center text-sm font-semibold tabular">
              {seats} seats
            </span>
            <button
              type="button"
              aria-label="More seats"
              className="grid size-7 place-items-center rounded-full transition-colors hover:bg-card disabled:opacity-40"
              onClick={() => setSeats((s) => Math.min(100, s + 1))}
              disabled={seats >= 100}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <Button
            className="h-9 gap-1.5 rounded-full px-5 font-semibold"
            onClick={startCheckout}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            Subscribe — ${29 * seats}/mo
          </Button>
        </div>
      )}
    </div>
  );
}
