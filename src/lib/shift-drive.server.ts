/**
 * Shift summary → Google Drive.
 *
 * Every stored shift summary is written as one spreadsheet-ready CSV file inside
 * "03 - Shift Summaries (শিফট সারসংক্ষেপ)/<year>". Re-running replaces the file
 * for that shift instead of piling up duplicates, and the resulting download
 * link is kept in `recording_doc_backups` so the IT Console can show it.
 */
import { uploadToDrive } from "./gdrive.server";
import { driveBranchFolder, dhakaYear } from "./drive-tree.server";
import type { ShiftSummaryRow } from "./shift-summary.server";

const BACKUP_KEY_PREFIX = "shift:";

/** Guards a spreadsheet cell against formula injection and CSV breakage. */
function cell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function dhakaStamp(iso: string) {
  const at = new Date(new Date(iso).getTime() + 6 * 60 * 60 * 1000);
  return at.toISOString().replace("T", " ").slice(0, 16);
}

export function shiftSummaryCsv(row: ShiftSummaryRow): string {
  const lines: string[] = [];
  lines.push([cell("শিফট"), cell(row.shift_label), cell(row.shift_key)].join(","));
  lines.push([cell("সময়"), cell(dhakaStamp(row.window_start)), cell(dhakaStamp(row.window_end))].join(","));
  lines.push([cell("তৈরি"), cell(dhakaStamp(row.generated_at))].join(","));
  lines.push("");
  lines.push(
    [
      cell("এজেন্ট"),
      cell("Agent ID"),
      cell("বরাদ্দ লিড"),
      cell("কল"),
      cell("সংযুক্ত"),
      cell("রিপোর্ট"),
      cell("অসম্পূর্ণ"),
      cell("ফলো-আপ"),
      cell("ক্যাটাগরি"),
    ].join(","),
  );
  for (const agent of row.agents) {
    const categories = Object.entries(agent.categories)
      .map(([label, count]) => `${label}: ${count}`)
      .join(" · ");
    lines.push(
      [
        cell(agent.name),
        cell(agent.employeeId),
        cell(agent.assigned),
        cell(agent.called),
        cell(agent.connected),
        cell(agent.reports),
        cell(agent.pending),
        cell(agent.followUps),
        cell(categories),
      ].join(","),
    );
  }
  lines.push("");
  lines.push(
    [
      cell("মোট"),
      cell(""),
      cell(""),
      cell(row.totals.called),
      cell(row.totals.connected),
      cell(row.totals.reports),
      cell(row.totals.pending),
      cell(row.totals.followUps),
      cell(""),
    ].join(","),
  );
  // BOM so Excel opens the Bengali text correctly.
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function fileName(row: ShiftSummaryRow) {
  return `Shift_${row.shift_key.replace(/[:\s]+/g, "_")}.csv`;
}

/** Uploads (or replaces) one stored shift summary in Drive. */
export async function backupShiftSummaryToDrive(shiftKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("shift_summaries")
    .select("*")
    .eq("shift_key", shiftKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("এই শিফটের সারসংক্ষেপ পাওয়া যায়নি");
  const row = data as unknown as ShiftSummaryRow;

  const folderId = await driveBranchFolder("shift_summaries", dhakaYear(row.window_start));
  const name = fileName(row);
  const bytes = new TextEncoder().encode(shiftSummaryCsv(row));

  const backupKey = `${BACKUP_KEY_PREFIX}${shiftKey}`;
  const { data: existing } = await supabaseAdmin
    .from("recording_doc_backups")
    .select("drive_file_id")
    .eq("date_key", backupKey)
    .maybeSingle();

  const uploaded = await uploadToDrive({
    name,
    mimeType: "text/csv",
    bytes,
    folderId,
  });

  // An earlier upload for the same shift is removed, so the folder keeps exactly
  // one current file per shift.
  if (existing?.drive_file_id && existing.drive_file_id !== uploaded.id) {
    try {
      const { driveFetch } = await import("./gdrive.server");
      await driveFetch(`/files/${existing.drive_file_id}`, { method: "DELETE" });
    } catch (cleanupError) {
      console.error("[gdrive] old shift file cleanup failed", cleanupError);
    }
  }

  const driveFileUrl =
    uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`;

  const { error: upsertError } = await supabaseAdmin.from("recording_doc_backups").upsert(
    {
      date_key: backupKey,
      doc_id: null,
      drive_file_id: uploaded.id,
      drive_file_name: uploaded.name,
      drive_file_url: driveFileUrl,
      drive_folder_id: folderId,
      status: "done",
      error_message: null,
    },
    { onConflict: "date_key" },
  );
  if (upsertError) throw new Error(upsertError.message);

  const { logAudit } = await import("./audit.server");
  await logAudit({
    action: "shift_summary_backed_up_to_drive",
    entityType: "shift_summary",
    entityId: shiftKey,
    metadata: { driveFileId: uploaded.id, driveFileName: uploaded.name, folderId },
  });

  return { shiftKey, driveFileId: uploaded.id, driveFileName: uploaded.name, driveFileUrl, folderId };
}

/** Drive links for a set of shift keys, for the IT Console list. */
export async function shiftDriveLinks(shiftKeys: string[]) {
  if (shiftKeys.length === 0) return {} as Record<string, string>;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("recording_doc_backups")
    .select("date_key, drive_file_url, status")
    .in(
      "date_key",
      shiftKeys.map((key) => `${BACKUP_KEY_PREFIX}${key}`),
    );
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.status === "done" && row.drive_file_url) {
      out[row.date_key.slice(BACKUP_KEY_PREFIX.length)] = row.drive_file_url;
    }
  }
  return out;
}

/** Best-effort auto upload used by the schedule; never breaks summary writing. */
export async function backupShiftSummaryQuietly(shiftKey: string) {
  try {
    const { getDriveBackupSettings } = await import("./recording-drive.server");
    const settings = await getDriveBackupSettings();
    if (!settings.enabled) return null;
    return await backupShiftSummaryToDrive(shiftKey);
  } catch (error) {
    console.error("[gdrive] shift summary backup failed", error);
    return null;
  }
}
