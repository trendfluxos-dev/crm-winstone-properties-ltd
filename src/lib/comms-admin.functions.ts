/**
 * IT Console / HQ operations for Twilio numbers, consent, do-not-contact and
 * webhook delivery health. Every value shown comes from Twilio or the database;
 * nothing is assumed configured.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveCaller } from "@/lib/access.server";

const AdminInput = z.object({ adminToken: z.string().nullable().optional() });

async function requireAuthority(adminToken: string | null) {
  const caller = await resolveCaller(adminToken);
  if (caller.scope !== "authority") {
    throw new Error("শুধুমাত্র IT Console/HQ এই কাজ করতে পারবেন");
  }
  return caller;
}

function publicBase(): string {
  const cfg = process.env["TWILIO_WEBHOOK_BASE_URL"] || process.env["PUBLIC_BASE_URL"];
  return (cfg || "https://webcrm.winstonebd.com").replace(/\/$/, "");
}

function webhookUrls() {
  const base = publicBase();
  return {
    voiceUrl: `${base}/api/public/twilio/voice`,
    statusCallback: `${base}/api/public/twilio/call-status`,
    recordingUrl: `${base}/api/public/twilio/recording`,
    smsUrl: `${base}/api/public/twilio/whatsapp`,
  };
}

export const listTwilioNumbers = createServerFn({ method: "POST" })
  .inputValidator((data: object) => AdminInput.parse(data))
  .handler(async ({ data }) => {
    await requireAuthority(data.adminToken ?? null);
    const { listIncomingNumbers, isConfigured, twilioConfig } = await import("@/lib/twilio.server");
    const expected = webhookUrls();

    if (!twilioConfig().apiKey) {
      return { configured: false, expected, numbers: [], error: "Twilio সংযোগ নেই" as string | null };
    }

    try {
      const numbers = await listIncomingNumbers();
      return {
        configured: isConfigured(),
        expected,
        error: null as string | null,
        numbers: numbers.map((n) => ({
          ...n,
          voiceWired: n.voiceUrl === expected.voiceUrl,
          statusWired: n.statusCallback === expected.statusCallback,
          smsWired: n.smsUrl === expected.smsUrl,
        })),
      };
    } catch (error) {
      return { configured: false, expected, numbers: [], error: String(error) };
    }
  });

export const wireTwilioNumber = createServerFn({ method: "POST" })
  .inputValidator((data: object) =>
    AdminInput.extend({ sid: z.string().min(10) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await requireAuthority(data.adminToken ?? null);
    const { updateNumberWebhooks } = await import("@/lib/twilio.server");
    const expected = webhookUrls();
    const updated = await updateNumberWebhooks({
      sid: data.sid,
      voiceUrl: expected.voiceUrl,
      statusCallback: expected.statusCallback,
      smsUrl: expected.smsUrl,
    });

    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      action: "twilio_number_wired",
      entityType: "twilio_number",
      entityId: updated.sid,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      metadata: { phoneNumber: updated.phoneNumber, ...expected },
    });

    return updated;
  });

export const searchTwilioNumbers = createServerFn({ method: "POST" })
  .inputValidator((data: object) =>
    AdminInput.extend({ country: z.string().min(2).max(2).default("US") }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireAuthority(data.adminToken ?? null);
    const { searchAvailableNumbers } = await import("@/lib/twilio.server");
    return await searchAvailableNumbers(data.country);
  });

export const buyTwilioNumber = createServerFn({ method: "POST" })
  .inputValidator((data: object) =>
    AdminInput.extend({ phoneNumber: z.string().min(6) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await requireAuthority(data.adminToken ?? null);
    const { purchaseNumber } = await import("@/lib/twilio.server");
    const expected = webhookUrls();
    const bought = await purchaseNumber({
      phoneNumber: data.phoneNumber,
      voiceUrl: expected.voiceUrl,
      statusCallback: expected.statusCallback,
      smsUrl: expected.smsUrl,
    });

    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      action: "twilio_number_purchased",
      entityType: "twilio_number",
      entityId: bought.sid,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      metadata: { phoneNumber: bought.phoneNumber },
    });

    return bought;
  });

export const webhookHealth = createServerFn({ method: "POST" })
  .inputValidator((data: object) => AdminInput.parse(data))
  .handler(async ({ data }) => {
    await requireAuthority(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("webhook_deliveries")
      .select("id, provider, event_id, event_type, status, attempts, error_message, created_at, processed_at")
      .order("created_at", { ascending: false })
      .limit(40);

    const counts = { received: 0, processed: 0, failed: 0, rejected: 0 };
    for (const row of rows ?? []) {
      if (row.status in counts) counts[row.status as keyof typeof counts] += 1;
    }

    return { recent: rows ?? [], counts };
  });

export const complianceList = createServerFn({ method: "POST" })
  .inputValidator((data: object) => AdminInput.parse(data))
  .handler(async ({ data }) => {
    await requireAuthority(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [dnc, consent] = await Promise.all([
      supabaseAdmin
        .from("do_not_contact")
        .select("id, phone_number, channel, reason, source, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("consent_records")
        .select("id, phone_number, channel, consent_type, granted, source, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return { doNotContact: dnc.data ?? [], consent: consent.data ?? [] };
  });

export const upsertDoNotContact = createServerFn({ method: "POST" })
  .inputValidator((data: object) =>
    AdminInput.extend({
      phoneNumber: z.string().min(6),
      channel: z.enum(["voice", "sms", "whatsapp", "all"]).default("all"),
      reason: z.string().max(200).nullable().optional(),
      remove: z.boolean().default(false),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await requireAuthority(data.adminToken ?? null);
    const { addDoNotContact, removeDoNotContact } = await import("@/lib/comms-guard.server");

    if (data.remove) {
      await removeDoNotContact(data.phoneNumber, data.channel);
    } else {
      await addDoNotContact({
        phoneNumber: data.phoneNumber,
        channel: data.channel,
        reason: data.reason ?? null,
        source: "it_console",
        addedBy: caller.profile?.id ?? null,
      });
    }

    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      action: data.remove ? "do_not_contact_removed" : "do_not_contact_added",
      entityType: "do_not_contact",
      entityId: data.phoneNumber,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      metadata: { channel: data.channel, reason: data.reason ?? null },
    });

    return { ok: true };
  });
