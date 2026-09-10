import { createFileRoute } from "@tanstack/react-router";

/**
 * Paddle webhook receiver. Verifies the signature, then mirrors the
 * subscription state into the workspace licence table. Registered for both
 * sandbox and live — the environment is picked from the signature secret that
 * successfully verifies.
 */
export const Route = createFileRoute("/api/public/paddle/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.clone().text();
        const signature = request.headers.get("paddle-signature");
        if (!signature || !rawBody) return new Response("Missing signature", { status: 401 });

        const { EventName, verifyWebhook } = await import("@/lib/paddle.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try the environment indicated by which secret verifies the payload.
        let env: "sandbox" | "live" | null = null;
        let event: Awaited<ReturnType<typeof verifyWebhook>> | null = null;
        for (const candidate of ["live", "sandbox"] as const) {
          try {
            const req = new Request(request.url, {
              method: "POST",
              headers: request.headers,
              body: rawBody,
            });
            event = await verifyWebhook(req, candidate);
            env = candidate;
            break;
          } catch {
            /* try the other environment */
          }
        }
        if (!env || !event) return new Response("Invalid signature", { status: 401 });

        type SubPayload = {
          id: string;
          customer_id: string;
          status: string;
          items?: { price?: { id?: string; product_id?: string }; quantity?: number }[];
          current_billing_period?: { starts_at?: string; ends_at?: string } | null;
          scheduled_change?: { action?: string } | null;
          custom_data?: { buyer_email?: string } | null;
        };

        if (
          event.eventType === EventName.SubscriptionCreated ||
          event.eventType === EventName.SubscriptionUpdated ||
          event.eventType === EventName.SubscriptionCanceled ||
          event.eventType === EventName.SubscriptionActivated
        ) {
          const sub = event.data as unknown as SubPayload;
          const firstItem = sub.items?.[0];
          const row = {
            paddle_subscription_id: sub.id,
            paddle_customer_id: sub.customer_id,
            product_id: firstItem?.price?.product_id ?? "unknown",
            price_id: firstItem?.price?.id ?? "unknown",
            seats: firstItem?.quantity ?? 1,
            status: sub.status,
            current_period_start: sub.current_billing_period?.starts_at ?? null,
            current_period_end: sub.current_billing_period?.ends_at ?? null,
            cancel_at_period_end: sub.scheduled_change?.action === "cancel",
            buyer_email: sub.custom_data?.buyer_email ?? null,
            environment: env,
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabaseAdmin
            .from("subscriptions")
            .upsert(row, { onConflict: "paddle_subscription_id" });
          if (error) {
            console.error("subscription upsert failed", error);
            return new Response("Store failed", { status: 500 });
          }
        }

        return new Response("ok");
      },
    },
  },
});
