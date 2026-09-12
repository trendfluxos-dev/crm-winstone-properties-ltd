/**
 * Backup call recordings and daily summary docs to Google Drive.
 *
 * Settings are stored in system_settings:
 *   - gdrive_backup_enabled (boolean)
 *   - gdrive_backup_folder_id (string|null)
 *
 * The service-role client is used for all reads/writes so this runs
 * independently of who is signed in to the CRM.
 */

import { logAudit } from "./audit.server";
import { createDriveDoc, getOrCreateDriveFolder, uploadToDrive } from "./gdrive.server";
import { syncRecordingDoc } from "./recording-doc.server";

export type DriveBackupSettings = {
  enabled: boolean;
  folderId: string | null;
  folderUrl: string | null;
};

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getDriveBackupSettings(): Promise<DriveBackupSettings> {
  const supabaseAdmin = await adminClient();
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["gdrive_backup_enabled", "gdrive_backup_folder_id"]);
  const enabledRow = data?.find((r) => r.key === "gdrive_backup_enabled");
  const folderRow = data?.find((r) => r.key === "gdrive_backup_folder_id");
  const enabled = enabledRow?.value === true;
  const folderId = typeof folderRow?.value === "string" ? folderRow.value : null;
  return {
    enabled,
    folderId,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
  };
}

export async function saveDriveBackupSettings(input: {
  enabled: boolean;
  folderId?: string | null;
  actorProfileId?: string | null;
}) {
  const supabaseAdmin = await adminClient();
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("system_settings").upsert(
    [
      { key: "gdrive_backup_enabled", value: input.enabled, updated_at: now },
      { key: "gdrive_backup_folder_id", value: input.folderId ?? null, updated_at: now },
    ],
    { onConflict: "key" },
  );
  if (error) throw new Error(`Drive সেটিংস সংরক্ষণ করা যায়নি: ${error.message}`);
  await logAudit({
    action: "drive_settings_updated",
    entityType: "system_settings",
    actorProfileId: input.actorProfileId ?? null,
    metadata: { enabled: input.enabled, folderId: input.folderId ?? null },
  });
  return getDriveBackupSettings();
}

function slug(value: string) {
  return (value || "unknown")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Upload one recording's audio file to Drive.
 * Idempotent: a recording with an existing successful backup is skipped.
 */
export async function backupRecordingToDrive(recordingId: string) {
  const supabaseAdmin = await adminClient();
  const settings = await getDriveBackupSettings();
  if (!settings.enabled) throw new Error("Google Drive ব্যাকআপ বন্ধ আছে");
  if (!settings.folderId) throw new Error("Google Drive ফোল্ডার আইডি দেওয়া হয়নি");

  const { data: existing } = await supabaseAdmin
    .from("recording_drive_backups")
    .select("id, status, drive_file_id, drive_file_url")
    .eq("call_recording_id", recordingId)
    .maybeSingle();
  if (existing?.status === "done" && existing.drive_file_id) {
    return { status: "already_done" as const, driveFileId: existing.drive_file_id, driveFileUrl: existing.drive_file_url };
  }

  const { data: recording } = await supabaseAdmin
    .from("call_recordings")
    .select(
      "id, lead_id, agent_id, phone_number, duration_seconds, recording_status, audio_url, storage_path, file_name, mime_type, file_size_bytes, started_at, created_at",
    )
    .eq("id", recordingId)
    .maybeSingle();
  if (!recording) throw new Error("রেকর্ডিং পাওয়া যায়নি");
  if (recording.recording_status !== "stored" || !recording.storage_path) {
    throw new Error(`রেকর্ডিং এখনো জমা হয়নি — অবস্থা: ${recording.recording_status ?? "unknown"}`);
  }

  const [{ data: leads }, { data: agents }] = await Promise.all([
    recording.lead_id
      ? supabaseAdmin.from("leads").select("id, name").eq("id", recording.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    recording.agent_id
      ? supabaseAdmin.from("profiles").select("id, name").eq("id", recording.agent_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const datePart = (recording.started_at ?? recording.created_at).slice(0, 10);
  const agentName = agents?.name ?? "অজানা-এজেন্ট";
  const leadName = leads?.name ?? "অজানা-লিড";
  const ext = (recording.file_name ?? recording.storage_path).split(".").pop() || "mp3";
  const driveFileName = `${datePart}_${slug(agentName)}_${slug(leadName)}_${slug(recording.phone_number)}_call.${ext}`;

  const { data: audioBlob, error: downloadError } = await supabaseAdmin.storage
    .from("call-audio")
    .download(recording.storage_path);
  if (downloadError || !audioBlob) {
    throw new Error(`অডিও ডাউনলোড ব্যর্থ: ${downloadError?.message ?? "empty"}`);
  }
  const bytes = await blobToBytes(audioBlob);

  const uploaded = await uploadToDrive({
    name: driveFileName,
    mimeType: recording.mime_type ?? `audio/${ext}`,
    bytes,
    folderId: settings.folderId,
  });

  const backup = {
    call_recording_id: recording.id,
    drive_file_id: uploaded.id,
    drive_file_name: uploaded.name,
    drive_file_url: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
    drive_folder_id: settings.folderId,
    bytes: recording.file_size_bytes ?? bytes.length,
    mime_type: recording.mime_type ?? `audio/${ext}`,
    status: "done" as const,
    error_message: null as string | null,
  };

  const { error: upsertError } = await supabaseAdmin
    .from("recording_drive_backups")
    .upsert(backup, { onConflict: "call_recording_id" });
  if (upsertError) throw new Error(`ব্যাকআপ রো সংরক্ষণ ব্যর্থ: ${upsertError.message}`);

  await logAudit({
    action: "recording_backed_up_to_drive",
    entityType: "call_recordingings",
    entityId: recording.id,
    actorProfileId: recording.agent_id,
    metadata: { driveFileId: uploaded.id, driveFileName: uploaded.name, bytes: bytes.length },
  });

  return {
    status: "done" as const,
    recordingId: recording.id,
    driveFileId: uploaded.id,
    driveFileName: uploaded.name,
    driveFileUrl: backup.drive_file_url,
  };
}

/** Back up every stored recording for one Dhaka calendar day. */
export async function syncDayRecordingsToDrive(dateKey: string) {
  const settings = await getDriveBackupSettings();
  if (!settings.enabled) throw new Error("Google Drive ব্যাকআপ বন্ধ আছে");
  if (!settings.folderId) throw new Error("Google Drive ফোল্ডার আইডি দেওয়া হয়নি");

  const supabaseAdmin = await adminClient();
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - 6 * 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const { data: recordings } = await supabaseAdmin
    .from("call_recordings")
    .select("id")
    .eq("recording_status", "stored")
    .not("storage_path", "is", null)
    .gte("started_at", dayStart.toISOString())
    .lt("started_at", dayEnd.toISOString())
    .order("started_at", { ascending: true });

  const ids = (recordings ?? []).map((r) => r.id);
  const results = { attempted: ids.length, done: 0, failed: 0, errors: [] as string[] };

  for (const id of ids) {
    try {
      const res = await backupRecordingToDrive(id);
      if (res.status === "done") results.done += 1;
      else if (res.status === "already_done") results.done += 1;
    } catch (error) {
      results.failed += 1;
      results.errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return results;
}

/** Create the day's summary doc inside the Drive folder and remember it. */
export async function backupRecordingDocToDrive(dateKey: string) {
  const settings = await getDriveBackupSettings();
  if (!settings.enabled) throw new Error("Google Drive ব্যাকআপ বন্ধ আছে");
  if (!settings.folderId) throw new Error("Google Drive ফোল্ডার আইডি দেওয়া হয়নি");

  const supabaseAdmin = await adminClient();

  const { data: existing } = await supabaseAdmin
    .from("recording_doc_backups")
    .select("id, status, doc_id, drive_file_url")
    .eq("date_key", dateKey)
    .maybeSingle();

  let docId = existing?.doc_id ?? undefined;

  if (!docId) {
    const created = await createDriveDoc(`Winstone রেকর্ডিং · ${dateKey}`, settings.folderId);
    docId = created.id;
  }

  // syncRecordingDoc writes content to any doc id; use the Drive-created one.
  const { docUrl, calls, recordings } = await syncRecordingDoc(dateKey, settings.folderId, docId);

  const backup = {
    date_key: dateKey,
    doc_id: docId,
    drive_file_id: docId,
    drive_file_name: `Winstone রেকর্ডিং · ${dateKey}`,
    drive_file_url: docUrl,
    drive_folder_id: settings.folderId,
    status: "done" as const,
    error_message: null as string | null,
  };

  const { error } = await supabaseAdmin.from("recording_doc_backups").upsert(backup, { onConflict: "date_key" });
  if (error) throw new Error(`ডক ব্যাকআপ রো সংরক্ষণ ব্যর্থ: ${error.message}`);

  await logAudit({
    action: "recording_doc_backed_up_to_drive",
    entityType: "recording_doc_backups",
    entityId: dateKey,
    metadata: { docId, calls, recordings, folderId: settings.folderId },
  });

  return { dateKey, docId, docUrl, calls, recordings };
}

export async function initializeDriveBackupFolder() {
  const settings = await getDriveBackupSettings();
  if (settings.folderId) return settings;
  const folderId = await getOrCreateDriveFolder("Winstone Recordings");
  await saveDriveBackupSettings({ enabled: true, folderId, actorProfileId: null });
  return getDriveBackupSettings();
}
