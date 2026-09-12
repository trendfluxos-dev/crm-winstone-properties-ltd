import { createFileRoute } from "@tanstack/react-router";

/**
 * Official Meta WhatsApp Cloud API webhook.
 * GET  — Meta's subscription verification handshake (hub.verify_token).
 * POST — inbound messages / statuses, signature verified before any write.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env["WHATSAPP_WEBHOOK_SECRET"];
        if (mode === "subscribe" && expected && token === expected) {
          return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        const { getWhatsAppProvider } = await import("@/lib/whatsapp-provider.server");
        const provider = getWhatsAppProvider();
        if (provider.status !== "configured") {
          return new Response("integration required", { status: 503 });
        }
        const result = await provider.processWebhook({ rawBody, signature });
        if (!result.ok) return new Response(result.reason ?? "rejected", { status: 401 });
        return new Response("ok");
      },
    },
  },
});
