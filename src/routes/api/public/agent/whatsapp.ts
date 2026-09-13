import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * WhatsApp sync from the agent's own phone — the same path SIM calls take.
 *
 * POST /api/public/agent/whatsapp
 * Header: x-device-token
 * Body: { lead_id, messages: [{ client_message_id, sender, text, sent_at?, message_type? }] }
 *
 * Winstone Connect posts the messages the agent actually exchanged with the
 * lead on WhatsApp, so the lead card shows the conversation next to the calls.
 * Idempotent per client_message_id: re-posting the same message stores nothing
 * new. Nothing is marked delivered here — status only reflects what the phone
 * reported.
 */
const Message = z.object({
  client_message_id: z.string().trim().min(6).max(120),
  sender: z.enum(["agent", "customer"]),
  text: z.string().trim().max(4000).nullable().optional(),
  message_type: z.enum(["text", "voice_note", "image", "document"]).default("text"),
  sent_at: z.string().datetime().optional(),
  media_url: z.string().url().max(2000).nullable().optional(),
});

const Body = z.object({
  lead_id: z.string().uuid(),
  messages: z.array(Message).min(1).max(100),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/agent/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind !== "device") return json({ error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
        }
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { LEAD_OWNER_COLUMNS, leadHeldByOther, LEAD_NOT_YOURS } =
          await import("@/lib/lead-access.server");

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select(`id, ${LEAD_OWNER_COLUMNS}`)
          .eq("id", body.lead_id)
          .maybeSingle();
        if (!lead) return json({ error: "লিড পাওয়া যায়নি" }, 404);
        if (leadHeldByOther(lead, caller.profile.id)) return json({ error: LEAD_NOT_YOURS }, 403);

        const ids = body.messages.map((m) => m.client_message_id);
        const { data: existing } = await supabaseAdmin
          .from("whatsapp_interactions")
          .select("provider_message_id")
          .eq("lead_id", body.lead_id)
          .in("provider_message_id", ids);
        const seen = new Set((existing ?? []).map((row) => row.provider_message_id));

        const fresh = body.messages.filter((m) => !seen.has(m.client_message_id));
        if (fresh.length > 0) {
          const { error } = await supabaseAdmin.from("whatsapp_interactions").insert(
            fresh.map((m) => ({
              lead_id: body.lead_id,
              agent_id: caller.profile.id,
              provider: "agent_device",
              provider_message_id: m.client_message_id,
              sender_type: m.sender,
              message_type: m.message_type,
              message_content: m.text ?? null,
              media_url: m.media_url ?? null,
              status: "synced",
              status_updated_at: new Date().toISOString(),
              created_at: m.sent_at ?? new Date().toISOString(),
            })),
          );
          if (error) return json({ error: error.message }, 500);

          const { logLeadEvent } = await import("@/lib/lead-events.server");
          await logLeadEvent({
            leadId: body.lead_id,
            agentId: caller.profile.id,
            kind: "whatsapp_message",
            detail: `ফোন থেকে ${fresh.length}টি হোয়াটসঅ্যাপ মেসেজ সিংক হয়েছে`,
          });

          const { recordSyncEvent } = await import("@/lib/call-jobs.server");
          await recordSyncEvent({
            agentId: caller.profile.id,
            deviceId: caller.device.id,
            eventType: "whatsapp_sync",
            entityType: "lead",
            entityId: body.lead_id,
            payload: { stored: fresh.length, duplicates: body.messages.length - fresh.length },
          });
        }

        return json({
          ok: true,
          stored: fresh.length,
          duplicates: body.messages.length - fresh.length,
        });
      },
    },
  },
});
