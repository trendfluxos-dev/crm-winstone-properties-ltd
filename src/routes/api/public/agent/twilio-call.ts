import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Twilio cloud call started from the Winstone Connect phone app.
 *
 * Same rules as the SIM dialler: the device token identifies the agent, the
 * unfinished-report lock is checked first, the lead must belong to that agent,
 * and opt-out / recording-consent guards run server side. Twilio then rings the
 * agent's own phone and bridges the customer, so the call row, lifecycle and
 * recording land in the CRM automatically through the Twilio webhooks.
 */
const Body = z.object({
  lead_id: z.string().uuid(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/agent/twilio-call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind !== "device") return json({ error: "Unauthorized" }, 401);

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "lead_id প্রয়োজন" }, 400);

        const { isConfigured, twilioConfig, normalizePhone, resolvePhoneNumber, createOutboundCall } =
          await import("@/lib/twilio.server");
        if (!isConfigured()) {
          return json({ error: "Twilio এখনো চালু নেই — সাধারণ সিম কল ব্যবহার করুন" }, 503);
        }

        const { pendingReportFor } = await import("@/lib/call-reports.server");
        const pending = await pendingReportFor(caller.profile.id);
        if (pending) {
          return json(
            {
              blocked: true,
              reason: "আগের কলের রিপোর্ট জমা দিন, তারপর পরের কল শুরু করা যাবে",
              report: pending,
            },
            409,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, name, phone_number, assigned_to, assigned_agent_id")
          .eq("id", parsed.data.lead_id)
          .maybeSingle();
        if (!lead) return json({ error: "Unknown lead" }, 404);

        const assignedId = lead.assigned_to ?? lead.assigned_agent_id;
        if (assignedId && assignedId !== caller.profile.id) {
          return json({ error: "এই লিড আপনার তালিকায় নেই" }, 403);
        }

        const agentPhone = caller.profile.phone ?? caller.device.phone_number;
        if (!agentPhone) {
          return json({ error: "আপনার প্রোফাইলে ফোন নম্বর নেই — CRM-এ যোগ করুন" }, 400);
        }

        const cfg = twilioConfig();
        const from = cfg.phoneNumber ?? (await resolvePhoneNumber(cfg));
        if (!from) return json({ error: "কোনো Twilio নম্বর কনফিগার করা নেই" }, 503);

        const customerPhone = normalizePhone(lead.phone_number);
        const { assertContactable, recordingAllowed } = await import("@/lib/comms-guard.server");
        try {
          await assertContactable(customerPhone, "voice");
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "যোগাযোগ বন্ধ" }, 403);
        }
        const record = await recordingAllowed(customerPhone, cfg.recordingEnabled);

        try {
          const call = await createOutboundCall({
            agentPhone: normalizePhone(agentPhone),
            customerPhone,
            leadId: lead.id,
            agentId: caller.profile.id,
            record,
          });

          const { logLeadEvent } = await import("@/lib/lead-events.server");
          await logLeadEvent({
            leadId: lead.id,
            agentId: caller.profile.id,
            kind: "call_started",
            detail: `${caller.profile.name} অ্যাপ থেকে Twilio কল শুরু করেছেন`,
          });

          return json({
            ok: true,
            call_sid: call.callSid,
            status: call.status,
            recording: record,
            message: record
              ? "Twilio আপনার ফোনে রিং করছে — ধরলে গ্রাহকের সাথে যুক্ত হবে ও রেকর্ড হবে"
              : "Twilio আপনার ফোনে রিং করছে — ধরলে গ্রাহকের সাথে যুক্ত হবে",
          });
        } catch (error) {
          console.error("[agent] twilio call failed", error);
          return json(
            { error: error instanceof Error ? error.message : "Twilio কল শুরু করা যায়নি" },
            502,
          );
        }
      },
    },
  },
});
