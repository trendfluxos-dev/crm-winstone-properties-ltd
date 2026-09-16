import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Provider-agnostic payment webhook for the monthly service bill.
 *
 * Two verification paths, in order:
 *  1. A connected provider adapter verifies its own signature.
 *  2. Generic HMAC-SHA256 over the raw body using BILLING_WEBHOOK_SECRET,
 *     sent as `x-billing-signature`.
 *
 * Without either, the request is rejected — a client-side "success" never
 * activates anything. Settlement itself is idempotent, so a replayed delivery
 * cannot double-activate the service or create a second architect payout.
 */
export const Route = createFileRoute("/api/public/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const json = (headers: Record<string, string> = {}) => headers;

        const { getPaymentProvider } = await import("@/lib/payment-adapter.server");
        const provider = getPaymentProvider();

        let verified: Awaited<
          ReturnType<NonNullable<ReturnType<typeof getPaymentProvider>>["verifyWebhook"]>
        > | null = null;

        if (provider) {
          verified = await provider.verifyWebhook(
            new Request(request.url, { method: "POST", headers: request.headers, body: rawBody }),
            rawBody,
          );
        } else {
          const secret = process.env["BILLING_WEBHOOK_SECRET"];
          const signature = request.headers.get("x-billing-signature") ?? "";
          if (!secret) {
            return new Response(JSON.stringify({ error: "payment provider not configured" }), {
              status: 503,
              headers: json({ "Content-Type": "application/json" }),
            });
          }
          const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
          const a = Buffer.from(signature);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response(JSON.stringify({ error: "invalid signature" }), {
              status: 401,
              headers: json({ "Content-Type": "application/json" }),
            });
          }

          let body: Record<string, unknown>;
          try {
            body = JSON.parse(rawBody) as Record<string, unknown>;
          } catch {
            return new Response(JSON.stringify({ error: "invalid json" }), {
              status: 400,
              headers: json({ "Content-Type": "application/json" }),
            });
          }
          const txnId = String(body["transaction_id"] ?? body["reference"] ?? "");
          if (!txnId) {
            return new Response(JSON.stringify({ error: "transaction_id required" }), {
              status: 400,
              headers: json({ "Content-Type": "application/json" }),
            });
          }
          verified = {
            provider: String(body["provider"] ?? "generic"),
            providerTxnId: txnId,
            amount: Number(body["amount"] ?? 0),
            currency: String(body["currency"] ?? "BDT"),
            invoiceReference: body["invoice_reference"]
              ? String(body["invoice_reference"])
              : null,
            succeeded: String(body["status"] ?? "").toLowerCase() === "succeeded",
            failureReason: body["failure_reason"] ? String(body["failure_reason"]) : null,
            payload: body,
          };
        }

        if (!verified) {
          return new Response(JSON.stringify({ error: "invalid signature" }), {
            status: 401,
            headers: json({ "Content-Type": "application/json" }),
          });
        }

        const { settlePayment } = await import("@/lib/service-billing.server");
        const result = await settlePayment({ ...verified, verification: "provider_webhook" });

        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: json({ "Content-Type": "application/json" }),
        });
      },
    },
  },
});
