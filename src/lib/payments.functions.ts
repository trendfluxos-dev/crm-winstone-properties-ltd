import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const EnvSchema = z.enum(["sandbox", "live"]);

/** Turns a human-readable price id (pro_monthly) into the Paddle price id. */
export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ priceId: z.string().min(1), environment: EnvSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { gatewayFetch } = await import("@/lib/paddle.server");
    const res = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("paddle price lookup failed", res.status, detail);
      throw new Error(`Price lookup failed [${res.status}]`);
    }
    const result = (await res.json()) as { data?: { id: string }[] };
    if (!result.data?.length) throw new Error("Price not found");
    return result.data[0]!.id;
  });

export type LicenseStatus = {
  active: boolean;
  status: string | null;
  seats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  environment: "sandbox" | "live";
};

/**
 * Workspace licence for the whole CRM. There are no individual customer
 * accounts here, so one active subscription unlocks the floor and the seat
 * quantity records how many agents were paid for.
 */
export const getLicenseStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ environment: EnvSchema }).parse(input))
  .handler(async ({ data }): Promise<LicenseStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("subscriptions")
      .select("status, seats, current_period_end, cancel_at_period_end")
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!row) {
      return {
        active: false,
        status: null,
        seats: 0,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        environment: data.environment,
      };
    }

    const end = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    const withinPeriod = end === null || end > Date.now();
    const active =
      (["active", "trialing", "past_due"].includes(row.status) && withinPeriod) ||
      (row.status === "canceled" && end !== null && end > Date.now());

    return {
      active,
      status: row.status,
      seats: row.seats ?? 0,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      environment: data.environment,
    };
  });

/** Paddle-hosted billing portal (cancel, invoices, payment method). Authority PIN only. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().min(1), environment: EnvSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id, paddle_subscription_id")
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("No subscription yet");

    const { getPaddleClient } = await import("@/lib/paddle.server");
    const paddle = getPaddleClient(data.environment);
    const session = await paddle.customerPortalSessions.create(row.paddle_customer_id, [
      row.paddle_subscription_id,
    ]);
    return { url: session.urls.general.overview };
  });
