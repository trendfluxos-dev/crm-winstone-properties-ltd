/**
 * The company's Google Drive folder tree.
 *
 * One root folder ("Winstone CRM") holds a fixed set of branches, each with a
 * year sub-folder. Folder ids are cached in `system_settings.gdrive_folder_map`
 * so day-to-day uploads cost no extra Drive lookups; if a cached folder was
 * deleted or moved to the trash we resolve (and if needed recreate) it once and
 * update the cache. Never guesses: an id is only cached after Drive confirms it.
 */
import { driveFolderExists, getOrCreateDriveFolder } from "./gdrive.server";

export type DriveBranch =
  | "recordings"
  | "day_exports"
  | "shift_summaries"
  | "lead_imports"
  | "documents"
  | "android_app"
  | "audit";

const BRANCH_NAME: Record<DriveBranch, string> = {
  recordings: "01 - Call Recordings (কল রেকর্ডিং)",
  day_exports: "02 - Daily Call Exports (দৈনিক এক্সপোর্ট)",
  shift_summaries: "03 - Shift Summaries (শিফট সারসংক্ষেপ)",
  lead_imports: "04 - Lead Imports (লিড ইমপোর্ট)",
  documents: "05 - Documents & Summaries (ডকুমেন্ট)",
  android_app: "06 - Android App (এজেন্ট অ্যাপ)",
  audit: "07 - Audit & Compliance (অডিট)",
};

const ROOT_NAME = "Winstone CRM";
const ROOT_KEY = "gdrive_root_folder_id";
const MAP_KEY = "gdrive_folder_map";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function readMap(): Promise<Record<string, string>> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", MAP_KEY)
    .maybeSingle();
  const value = data?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, id] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id === "string" && id) out[key] = id;
  }
  return out;
}

async function writeMap(map: Record<string, string>) {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("system_settings")
    .upsert(
      { key: MAP_KEY, value: map, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
}

/** The root company folder; created on first use if it is not there yet. */
export async function driveRootFolderId(): Promise<string> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", ROOT_KEY)
    .maybeSingle();
  const cached = typeof data?.value === "string" ? data.value : null;
  if (cached && (await driveFolderExists(cached))) return cached;

  const folderId = await getOrCreateDriveFolder(ROOT_NAME);
  await supabaseAdmin
    .from("system_settings")
    .upsert(
      { key: ROOT_KEY, value: folderId, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  return folderId;
}

/**
 * Folder id for one branch, optionally its year sub-folder (`2026`). Uses the
 * cached id when Drive still has it, otherwise resolves by name under the
 * parent and caches the result.
 */
export async function driveBranchFolder(
  branch: DriveBranch,
  year?: number | string | null,
): Promise<string> {
  const map = await readMap();
  const branchKey = branch;
  let branchId = map[branchKey] ?? null;
  if (!branchId || !(await driveFolderExists(branchId))) {
    const root = await driveRootFolderId();
    branchId = await getOrCreateDriveFolder(BRANCH_NAME[branch], root);
    map[branchKey] = branchId;
    await writeMap(map);
  }
  if (!year) return branchId;

  const yearKey = `${branch}:${year}`;
  let yearId = map[yearKey] ?? null;
  if (!yearId || !(await driveFolderExists(yearId))) {
    yearId = await getOrCreateDriveFolder(String(year), branchId);
    map[yearKey] = yearId;
    await writeMap(map);
  }
  return yearId;
}

/** Dhaka-time year for an instant, so files land in the right year folder. */
export function dhakaYear(iso: string | Date): number {
  const at = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(at.getTime() + 6 * 60 * 60 * 1000).getUTCFullYear();
}

export function driveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
