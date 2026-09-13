/**
 * Consent + do-not-contact guard for every outbound communication (server only).
 *
 * Nothing here fabricates a consent state: when no consent row exists the
 * caller decides whether the channel is allowed by policy, and recording is
 * only announced when the notice is actually configured.
 */

import { normalizePhone } from "@/lib/ingest-resolve.server";

export type CommsChannel = "voice" | "sms" | "whatsapp" | "all";
export type ConsentType = "recording" | "marketing";

export type DncHit = {
  phoneNumber: string;
  channel: string;
  reason: string | null;
};

export async function findDoNotContact(rawPhone: string, channel: CommsChannel): Promise<DncHit | null> {
  const phone = normalizePhone(rawPhone);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("do_not_contact")
    .select("phone_number, channel, reason")
    .eq("phone_number", phone)
    .in("channel", [channel, "all"])
    .limit(1);
  const hit = data?.[0];
  if (!hit) return null;
  return { phoneNumber: hit.phone_number, channel: hit.channel, reason: hit.reason };
}

export async function latestConsent(
  rawPhone: string,
  consentType: ConsentType,
): Promise<{ granted: boolean; at: string; source: string } | null> {
  const phone = normalizePhone(rawPhone);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("consent_records")
    .select("granted, created_at, source")
    .eq("phone_number", phone)
    .eq("consent_type", consentType)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return { granted: row.granted, at: row.created_at, source: row.source };
}

/** Throws a Bengali, user-facing error when the number must not be contacted. */
export async function assertContactable(rawPhone: string, channel: CommsChannel): Promise<void> {
  const hit = await findDoNotContact(rawPhone, channel);
  if (hit) {
    throw new Error(
      hit.reason
        ? `এই নম্বরে যোগাযোগ নিষিদ্ধ (${hit.reason})`
        : "এই নম্বরটি 'যোগাযোগ করবেন না' তালিকায় আছে",
    );
  }
}

/**
 * Recording is allowed when the consent notice is configured (announced to the
 * customer at call start) and the customer has not explicitly refused before.
 */
export async function recordingAllowed(rawPhone: string, noticeConfigured: boolean): Promise<boolean> {
  if (!noticeConfigured) return false;
  const consent = await latestConsent(rawPhone, "recording");
  if (consent && !consent.granted) return false;
  return true;
}

export async function saveConsent(input: {
  leadId?: string | null;
  phoneNumber: string;
  channel: CommsChannel;
  consentType: ConsentType;
  granted: boolean;
  source: string;
  note?: string | null;
  recordedBy?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("consent_records").insert({
    lead_id: input.leadId ?? null,
    phone_number: normalizePhone(input.phoneNumber),
    channel: input.channel,
    consent_type: input.consentType,
    granted: input.granted,
    source: input.source,
    note: input.note ?? null,
    recorded_by: input.recordedBy ?? null,
  });
}

export async function addDoNotContact(input: {
  phoneNumber: string;
  channel: CommsChannel;
  reason?: string | null;
  source?: string;
  addedBy?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("do_not_contact")
    .upsert(
      {
        phone_number: normalizePhone(input.phoneNumber),
        channel: input.channel,
        reason: input.reason ?? null,
        source: input.source ?? "manual",
        added_by: input.addedBy ?? null,
      },
      { onConflict: "phone_number,channel" },
    );
}

export async function removeDoNotContact(phoneNumber: string, channel: CommsChannel): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("do_not_contact")
    .delete()
    .eq("phone_number", normalizePhone(phoneNumber))
    .eq("channel", channel);
}
