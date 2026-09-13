/**
 * Daily recording index in Google Docs.
 *
 * For one Dhaka calendar day this builds a document that lists every synced
 * call with a stable file name (date · agent · lead · phone · call number) and
 * a short-lived signed playback link. Nothing is invented: a call without
 * stored audio is written with its real recording state instead of a link.
 */

import { createDriveDoc } from "./gdrive.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_docs/v1";
const SIGNED_URL_SECONDS = 6 * 60 * 60;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

const RECORDING_TEXT: Record<string, string> = {
  stored: "রেকর্ডিং জমা আছে",
  pending: "রেকর্ডিং অপেক্ষায়",
  uploading: "আপলোড হচ্ছে",
  missing: "রেকর্ডিং পাওয়া যায়নি",
  failed: "আপলোড ব্যর্থ",
  not_available: "এই ফোনে রেকর্ডিং সম্ভব নয়",
};

function dhakaTime(iso: string) {
  return new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS).toISOString().slice(11, 19);
}

function hms(total: number) {
  const s = Math.max(0, Math.round(total));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return h > 0
    ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
    : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** Safe, human-readable file name part. */
function slug(value: string) {
  return (value || "unknown")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DOCS_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Docs সংযোগ কনফিগার করা নেই");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function docsFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...gatewayHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Docs gateway failed [${response.status}]: ${body}`);
    throw new Error(`Google Docs ত্রুটি [${response.status}]: ${body.slice(0, 300)}`);
  }
  return body ? (JSON.parse(body) as Record<string, unknown>) : null;
}

export type RecordingDocLine = {
  fileName: string;
  time: string;
  agentName: string;
  leadName: string;
  phone: string;
  durationLabel: string;
  audioUrl: string | null;
  recordingState: string;
};

/** Every call of that Dhaka day, in file-name order, newest last. */
export async function buildRecordingDocLines(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - DHAKA_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("call_recordings")
    .select(
      "id, lead_id, agent_id, phone_number, duration_seconds, recording_status, audio_url, started_at, created_at",
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
      ? supabaseAdmin.from("profiles").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const leadName = new Map((leads ?? []).map((l) => [l.id, l.name]));
  const agentName = new Map((agents ?? []).map((a) => [a.id, a.name]));

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

  let counter = 0;
  const lines: RecordingDocLine[] = inDay.map((row) => {
    counter += 1;
    const agent = (row.agent_id ? agentName.get(row.agent_id) : null) ?? "অজানা-এজেন্ট";
    const lead = (row.lead_id ? leadName.get(row.lead_id) : null) ?? "অজানা-লিড";
    const status = row.recording_status ?? "pending";
    return {
      fileName: `${dateKey}_${slug(agent)}_${slug(lead)}_${slug(row.phone_number)}_call-${String(
        counter,
      ).padStart(3, "0")}`,
      time: dhakaTime(row.started_at ?? row.created_at),
      agentName: agent,
      leadName: lead,
      phone: row.phone_number,
      durationLabel: hms(row.duration_seconds ?? 0),
      audioUrl: row.audio_url ? (signedByPath.get(row.audio_url) ?? null) : null,
      recordingState: RECORDING_TEXT[status] ?? status,
    };
  });

  return { lines, dayStart: dayStart.toISOString(), dayEnd: dayEnd.toISOString() };
}

function docText(dateKey: string, lines: RecordingDocLine[]) {
  const head = [
    `Winstone Connect · রেকর্ডিং তালিকা · ${dateKey}`,
    `মোট কল: ${lines.length} · রেকর্ডিং জমা: ${lines.filter((l) => l.audioUrl).length}`,
    `তৈরি: ${new Date(Date.now() + DHAKA_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ")} (ঢাকা)`,
    "",
  ];
  const body = lines.length
    ? lines.map(
        (l) =>
          `${l.fileName}\n  সময়: ${l.time} · এজেন্ট: ${l.agentName} · লিড: ${l.leadName} · নম্বর: ${l.phone} · কথা: ${l.durationLabel}\n  ${
            l.audioUrl ? `রেকর্ডিং: ${l.audioUrl}` : `রেকর্ডিং: ${l.recordingState}`
          }`,
      )
    : ["এই দিনে কোনো কল সিংক হয়নি।"];
  return `${[...head, ...body].join("\n")}\n`;
}

type DocState = { docId?: string; updatedAt?: string };

/**
 * Creates (or rewrites) the day's recording document and returns its link.
 * Re-running the same day replaces the content so repeats stay idempotent.
 *
 * @param folderId optional Google Drive folder where a new doc should be created.
 * @param preferredDocId optional existing doc id to reuse (used by Drive backup).
 */
export async function syncRecordingDoc(
  dateKey: string,
  folderId?: string | null,
  preferredDocId?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const configId = `recording_doc:${dateKey}`;
  const { data: config } = await supabaseAdmin
    .from("app_config")
    .select("data")
    .eq("id", configId)
    .maybeSingle();
  const state = (config?.data ?? {}) as DocState;

  const { lines } = await buildRecordingDocLines(dateKey);
  const text = docText(dateKey, lines);

  let docId = preferredDocId ?? state.docId;
  if (docId) {
    // Confirm the remembered document still exists before rewriting it.
    try {
      const doc = (await docsFetch(`/documents/${docId}?fields=body.content`)) as {
        body?: { content?: { endIndex?: number }[] };
      } | null;
      const endIndex = doc?.body?.content?.at(-1)?.endIndex ?? 1;
      if (endIndex > 2) {
        await docsFetch(`/documents/${docId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({
            requests: [
              { deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } },
            ],
          }),
        });
      }
    } catch {
      docId = undefined;
    }
  }

  if (!docId) {
    if (folderId) {
      const created = await createDriveDoc(`Winstone রেকর্ডিং · ${dateKey}`, folderId);
      docId = created.id;
    } else {
      const created = (await docsFetch(`/documents`, {
        method: "POST",
        body: JSON.stringify({ title: `Winstone রেকর্ডিং · ${dateKey}` }),
      })) as { documentId?: string } | null;
      docId = created?.documentId;
    }
    if (!docId) throw new Error("Google Docs ডকুমেন্ট তৈরি হয়নি");
  }

  await docsFetch(`/documents/${docId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text } }] }),
  });

  const updatedAt = new Date().toISOString();
  await supabaseAdmin
    .from("app_config")
    .upsert({ id: configId, data: { docId, updatedAt } }, { onConflict: "id" });

  return {
    dateKey,
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    calls: lines.length,
    recordings: lines.filter((l) => l.audioUrl).length,
    updatedAt,
    lines,
  };
}
