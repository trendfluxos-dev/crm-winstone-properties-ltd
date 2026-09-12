import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Payload = z.object({
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().min(5).optional(),
  agent_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().min(2).max(20).nullable().optional(),
  lead_name: z.string().trim().min(1).max(120).nullable().optional(),
  sender_type: z.enum(["agent", "customer"]),
  message_type: z.enum(["text", "voice_note", "image", "document"]).default("text"),
  message_content: z.string().min(1),
  media_url: z.string().nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/ingest/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        const parsed = Payload.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { resolveAgent, resolveLeadId } = await import("@/lib/ingest-resolve.server");

        // A phone always logs as its own agent — the body cannot spoof another.
        const agent =
          caller.kind === "device"
            ? { id: caller.profile.id }
            : await resolveAgent({
                agentId: body.agent_id ?? null,
                employeeId: body.employee_id ?? null,
              });

        const { leadId, created } = await resolveLeadId({
          leadId: body.lead_id ?? null,
          phoneNumber: body.phone_number ?? null,
          agentId: agent?.id ?? null,
          source: "whatsapp",
          fallbackName: body.lead_name ?? null,
        });
        if (!leadId) return json({ error: "Unknown lead" }, 404);

        const { error } = await supabaseAdmin.from("whatsapp_interactions").insert({
          lead_id: leadId,
          agent_id: agent?.id ?? null,
          sender_type: body.sender_type,
          message_type: body.message_type,
          message_content: body.message_content,
          media_url: body.media_url ?? null,
          duration_seconds: body.duration_seconds ?? null,
        });
        if (error) return json({ error: error.message }, 500);

        const { logLeadEvent } = await import("@/lib/lead-events.server");
        await logLeadEvent({
          leadId,
          agentId: agent?.id ?? null,
          kind: "whatsapp_message",
          detail:
            body.sender_type === "agent" ? "এজেন্ট হোয়াটসঅ্যাপে লিখেছেন" : "ক্রেতা হোয়াটসঅ্যাপে উত্তর দিয়েছেন",
        });

        return json({ ok: true, lead_id: leadId, lead_created: created, agent_id: agent?.id ?? null }, 201);
      },
    },
  },
});
