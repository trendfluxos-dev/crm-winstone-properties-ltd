/**
 * One-day call + recording export for HQ.
 *
 * Returns every call row that belongs to a single Dhaka calendar day with an
 * accurate count and talk time, plus a short-lived signed playback link for
 * each stored recording. Nothing is invented: a call with no stored audio comes
 * back with an empty link and its real recording state.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  adminToken: z.string().nullable().optional(),
  /** Dhaka calendar day, YYYY-MM-DD. */
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DayCallRow = {
  id: string;
  atDhaka: string;
  agentName: string;
  employeeId: string | null;
  leadName: string;
  phone: string;
  source: string;
  direction: string;
  callStatus: string;
  durationSeconds: number;
  durationLabel: string;
  connected: boolean;
  recordingStatus: string;
  audioUrl: string | null;
  audioExpiresInMinutes: number | null;
  transcript: boolean;
  summary: string;
  category: string;
};

const SIGNED_URL_SECONDS = 6 * 60 * 60;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function dhakaLabel(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS);
  return shifted.toISOString().replace("T", " ").slice(0, 19);
}

function hms(total: number) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export const dayCallExport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope !== "authority" && caller.scope !== "coordinator") {
      throw new Error("শুধুমাত্র HQ বা কোঅর্ডিনেটর এই এক্সপোর্ট নিতে পারবেন");
    }

    const [y, m, d] = data.dateKey.split("-").map(Number);
    const dayStart = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - DHAKA_OFFSET_MS);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Widen the raw window by a day on both sides, then filter on the call's
    // own effective start time so late-arriving rows land on the right day.
    const { data: rows, error } = await supabaseAdmin
      .from("call_recordings")
      .select(
        "id, lead_id, agent_id, phone_number, call_direction, call_source, call_status, duration_seconds, recording_status, audio_url, transcription_text, ai_summary, ai_lead_category, started_at, created_at",
      )
      .gte("created_at", new Date(dayStart.getTime() - 86_400_000).toISOString())
      .lt("created_at", new Date(dayEnd.getTime() + 86_400_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(3000);
    if (error) throw new Error("কল তালিকা আনা যায়নি");

    const inDay = (rows ?? []).filter((row) => {
      const at = new Date(row.started_at ?? row.created_at).getTime();
      return at >= dayStart.getTime() && at < dayEnd.getTime();
    });

    const leadIds = [...new Set(inDay.map((r) => r.lead_id).filter(Boolean))] as string[];
    const agentIds = [...new Set(inDay.map((r) => r.agent_id).filter(Boolean))] as string[];

    const [{ data: leads }, { data: agents }] = await Promise.all([
      leadIds.length
        ? supabaseAdmin.from("leads").select("id, name").in("id", leadIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      agentIds.length
        ? supabaseAdmin.from("profiles").select("id, name, employee_id").in("id", agentIds)
        : Promise.resolve({
            data: [] as { id: string; name: string; employee_id: string | null }[],
          }),
    ]);

    const leadName = new Map((leads ?? []).map((l) => [l.id, l.name]));
    const agentMap = new Map((agents ?? []).map((a) => [a.id, a]));

    // Sign every stored recording once, in one pass.
    const paths = inDay.map((r) => r.audio_url).filter((p): p is string => !!p);
    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from("call-audio")
        .createSignedUrls([...new Set(paths)], SIGNED_URL_SECONDS);
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    }

    const CONNECTED_SECONDS = 30;
    const calls: DayCallRow[] = inDay.map((row) => {
      const agent = row.agent_id ? agentMap.get(row.agent_id) : undefined;
      const audio = row.audio_url ? (signedByPath.get(row.audio_url) ?? null) : null;
      return {
        id: row.id,
        atDhaka: dhakaLabel(row.started_at ?? row.created_at),
        agentName: agent?.name ?? "—",
        employeeId: agent?.employee_id ?? null,
        leadName: (row.lead_id ? leadName.get(row.lead_id) : null) ?? "—",
        phone: maskWhen(caller.maskPii, row.phone_number),
        source: row.call_source ?? "android",
        direction: row.call_direction,
        callStatus: row.call_status ?? "—",
        durationSeconds: row.duration_seconds ?? 0,
        durationLabel: hms(row.duration_seconds ?? 0),
        connected: (row.duration_seconds ?? 0) > CONNECTED_SECONDS,
        recordingStatus: row.recording_status ?? "—",
        audioUrl: audio,
        audioExpiresInMinutes: audio ? SIGNED_URL_SECONDS / 60 : null,
        transcript: !!row.transcription_text,
        summary: row.ai_summary ?? "",
        category: row.ai_lead_category ?? "",
      };
    });

    const talkSeconds = calls.reduce((sum, c) => sum + c.durationSeconds, 0);
    const withAudio = calls.filter((c) => c.audioUrl).length;

    return {
      dateKey: data.dateKey,
      windowStart: dayStart.toISOString(),
      windowEnd: dayEnd.toISOString(),
      generatedAt: new Date().toISOString(),
      totals: {
        calls: calls.length,
        connected: calls.filter((c) => c.connected).length,
        talkSeconds,
        talkLabel: hms(talkSeconds),
        recordings: withAudio,
        recordingsMissing: calls.length - withAudio,
        transcripts: calls.filter((c) => c.transcript).length,
      },
      calls,
    };
  });

const RecentInput = z.object({
  adminToken: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Live list of the most recently synced calls: when the call happened, how long
 * they talked, and a short-lived signed link for the stored recording. Calls
 * with no stored audio report their real recording state instead of a link.
 */
export const recentSyncedCalls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RecentInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope !== "authority" && caller.scope !== "coordinator") {
      throw new Error("শুধুমাত্র HQ বা কোঅর্ডিনেটর এই তালিকা দেখতে পারবেন");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("call_recordings")
      .select(
        "id, lead_id, agent_id, phone_number, call_direction, call_source, call_status, duration_seconds, recording_status, upload_status, audio_url, transcription_text, ai_summary, ai_lead_category, started_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error("কল তালিকা আনা যায়নি");

    const list = rows ?? [];
    const leadIds = [...new Set(list.map((r) => r.lead_id).filter(Boolean))] as string[];
    const agentIds = [...new Set(list.map((r) => r.agent_id).filter(Boolean))] as string[];

    const [{ data: leads }, { data: agents }] = await Promise.all([
      leadIds.length
        ? supabaseAdmin.from("leads").select("id, name").in("id", leadIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      agentIds.length
        ? supabaseAdmin.from("profiles").select("id, name, employee_id").in("id", agentIds)
        : Promise.resolve({
            data: [] as { id: string; name: string; employee_id: string | null }[],
          }),
    ]);
    const leadName = new Map((leads ?? []).map((l) => [l.id, l.name]));
    const agentMap = new Map((agents ?? []).map((a) => [a.id, a]));

    const paths = list.map((r) => r.audio_url).filter((p): p is string => !!p);
    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from("call-audio")
        .createSignedUrls([...new Set(paths)], SIGNED_URL_SECONDS);
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    }

    const calls = list.map((row) => {
      const agent = row.agent_id ? agentMap.get(row.agent_id) : undefined;
      const audio = row.audio_url ? (signedByPath.get(row.audio_url) ?? null) : null;
      return {
        id: row.id,
        atDhaka: dhakaLabel(row.started_at ?? row.created_at),
        syncedAtDhaka: dhakaLabel(row.created_at),
        agentName: agent?.name ?? "—",
        employeeId: agent?.employee_id ?? null,
        leadName: (row.lead_id ? leadName.get(row.lead_id) : null) ?? "—",
        phone: maskWhen(caller.maskPii, row.phone_number),
        source: row.call_source ?? "android",
        direction: row.call_direction,
        callStatus: row.call_status ?? "—",
        durationSeconds: row.duration_seconds ?? 0,
        durationLabel: hms(row.duration_seconds ?? 0),
        recordingStatus: row.recording_status ?? "—",
        uploadStatus: row.upload_status ?? "—",
        audioUrl: audio,
        transcript: !!row.transcription_text,
        summary: row.ai_summary ?? "",
        category: row.ai_lead_category ?? "",
      };
    });

    const talkSeconds = calls.reduce((sum, c) => sum + c.durationSeconds, 0);

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        calls: calls.length,
        talkSeconds,
        talkLabel: hms(talkSeconds),
        recordings: calls.filter((c) => c.audioUrl).length,
      },
      calls,
    };
  });

export type RecentSyncedCall = Awaited<ReturnType<typeof recentSyncedCalls>>["calls"][number];
