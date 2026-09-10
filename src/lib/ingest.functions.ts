import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { validatePayload, type IngestKind } from "@/lib/ingest-schemas";

/** Checks a sample payload against the live ingest rules. Never writes anything. */
export const checkIngestPayload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: z.string().min(1),
        kind: z.enum(["recording", "message", "lead"]),
        payload: z.string().max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.payload);
    } catch {
      return {
        ok: false as const,
        issues: [{ field: "payload", message: "This is not valid JSON" }],
        normalized: null,
      };
    }
    const result = validatePayload(data.kind as IngestKind, parsed);
    return {
      ok: result.ok,
      issues: result.issues,
      normalized: result.ok ? JSON.stringify(result.normalized, null, 2) : null,
    };
  });

/** Live health of the pipes plus the data problems worth fixing. */
export const runIngestDiagnostics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { BD_PHONE } = await import("@/lib/ingest-schemas");

    const [leadsRes, callsRes, msgRes, bucketRes] = await Promise.all([
      supabaseAdmin.from("leads").select("id, phone_number, assigned_to, created_at"),
      supabaseAdmin
        .from("call_recordings")
        .select("id, lead_id, agent_id, sync_status, transcription_text, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from("whatsapp_interactions")
        .select("id, lead_id, agent_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin.storage.from("call-audio").list("", { limit: 1 }),
    ]);

    const leads = leadsRes.data ?? [];
    const calls = callsRes.data ?? [];
    const messages = msgRes.data ?? [];

    const phoneCount = new Map<string, number>();
    for (const lead of leads) {
      const key = lead.phone_number.replace(/[^\d]/g, "").slice(-11);
      phoneCount.set(key, (phoneCount.get(key) ?? 0) + 1);
    }

    const latest = (rows: { created_at: string }[]) => rows[0]?.created_at ?? null;

    return {
      checks: [
        {
          key: "ingest_secret",
          label: "Ingest secret configured",
          ok: Boolean(process.env["INGEST_SECRET"]),
          detail: process.env["INGEST_SECRET"]
            ? "Phones must send the x-ingest-secret header"
            : "Set the ingest secret before the phones go live",
        },
        {
          key: "ai_key",
          label: "AI transcription available",
          ok: Boolean(process.env["LOVABLE_API_KEY"]),
          detail: process.env["LOVABLE_API_KEY"]
            ? "Transcript, summary and sentiment run on upload"
            : "Recordings will store without transcripts",
        },
        {
          key: "audio_store",
          label: "Call audio storage reachable",
          ok: !bucketRes.error,
          detail: bucketRes.error ? bucketRes.error.message : "Private call-audio store responding",
        },
        {
          key: "admin_pin",
          label: "Control board PIN configured",
          ok: Boolean(process.env["ADMIN_PIN"] ?? process.env["IT_CONSOLE_PIN"]),
          detail: "Master and IT console PINs are stored server-side",
        },
      ],
      problems: [
        {
          key: "bad_phone",
          label: "Leads with an unusable phone number",
          count: leads.filter((l) => !BD_PHONE.test(l.phone_number.trim())).length,
          hint: "The phone app cannot dial these — fix or re-import them.",
        },
        {
          key: "duplicate_phone",
          label: "Duplicate phone numbers",
          count: [...phoneCount.values()].filter((n) => n > 1).length,
          hint: "Two agents may be calling the same customer.",
        },
        {
          key: "unassigned",
          label: "Leads with no agent",
          count: leads.filter((l) => !l.assigned_to).length,
          hint: "Run Balance Leads on the Coordinator Deck.",
        },
        {
          key: "failed_sync",
          label: "Recordings that failed to sync",
          count: calls.filter((c) => c.sync_status === "failed").length,
          hint: "The phone uploaded audio the server could not process.",
        },
        {
          key: "no_transcript",
          label: "Recordings without a transcript",
          count: calls.filter((c) => !c.transcription_text).length,
          hint: "Usually a missing AI key or a silent recording.",
        },
        {
          key: "orphan_call",
          label: "Call logs with no lead",
          count: calls.filter((c) => !c.lead_id).length,
          hint: "The phone number did not match any lead.",
        },
        {
          key: "no_agent",
          label: "Logs with no agent stamped",
          count:
            calls.filter((c) => !c.agent_id).length + messages.filter((m) => !m.agent_id).length,
          hint: "The phone app must send agent_id with every upload.",
        },
      ],
      volumes: {
        leads: leads.length,
        calls: calls.length,
        messages: messages.length,
        lastCallAt: latest(calls),
        lastMessageAt: latest(messages),
        lastLeadAt: latest([...leads].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))),
      },
      checkedAt: new Date().toISOString(),
    };
  });
