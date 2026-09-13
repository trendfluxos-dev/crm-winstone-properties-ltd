/**
 * Per-agent Google Drive folders.
 *
 * Every agent gets one folder inside the company recordings folder, so a
 * recording always lands in the folder that belongs to the agent who made the
 * call. The mapping lives in `drive_agent_folders`, which lets us keep the same
 * Drive folder when things change:
 *   - agent name / employee id changes  -> folder is renamed in place
 *   - company root folder changes       -> folder is moved under the new root
 *   - new agent joins                   -> folder is created on first use
 *   - folder deleted in Drive           -> a fresh folder is created
 */

import {
  driveFolderExists,
  getOrCreateDriveFolder,
  moveDriveFile,
  renameDriveFile,
} from "./gdrive.server";

export type AgentFolder = {
  profileId: string;
  folderId: string;
  folderName: string;
  folderUrl: string;
  action: "reused" | "created" | "renamed" | "moved" | "recreated";
};

type AgentRow = {
  id: string;
  name: string | null;
  employee_id: string | null;
  phone: string | null;
};

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function clean(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Stable, human-readable folder name for one agent. */
export function agentFolderName(agent: AgentRow): string {
  const name = clean(agent.name ?? "") || "নামহীন এজেন্ট";
  const badge = clean(agent.employee_id ?? agent.phone ?? "") || agent.id.slice(0, 8);
  return `${name} (${badge})`;
}

function folderUrl(id: string) {
  return `https://drive.google.com/drive/folders/${id}`;
}

/**
 * Returns the agent's Drive folder, creating/renaming/moving it as needed so it
 * always matches the agent's current name and the current company root folder.
 */
export async function resolveAgentDriveFolder(
  agent: AgentRow,
  parentFolderId: string,
): Promise<AgentFolder> {
  const supabaseAdmin = await adminClient();
  const wantedName = agentFolderName(agent);

  const { data: existing } = await supabaseAdmin
    .from("drive_agent_folders")
    .select("id, folder_id, folder_name, parent_folder_id")
    .eq("profile_id", agent.id)
    .maybeSingle();

  let folderId = existing?.folder_id ?? null;
  let action: AgentFolder["action"] = existing ? "reused" : "created";

  if (folderId && !(await driveFolderExists(folderId))) {
    folderId = null;
    action = "recreated";
  }

  if (folderId) {
    if (existing && existing.parent_folder_id !== parentFolderId) {
      await moveDriveFile(folderId, parentFolderId, existing.parent_folder_id);
      action = "moved";
    }
    if (existing && existing.folder_name !== wantedName) {
      await renameDriveFile(folderId, wantedName);
      action = action === "moved" ? "moved" : "renamed";
    }
  } else {
    folderId = await getOrCreateDriveFolder(wantedName, parentFolderId);
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("drive_agent_folders").upsert(
    {
      profile_id: agent.id,
      folder_id: folderId,
      folder_name: wantedName,
      parent_folder_id: parentFolderId,
      last_synced_at: now,
      updated_at: now,
    },
    { onConflict: "profile_id" },
  );
  if (error) throw new Error(`এজেন্ট ফোল্ডার সংরক্ষণ ব্যর্থ: ${error.message}`);

  return {
    profileId: agent.id,
    folderId,
    folderName: wantedName,
    folderUrl: folderUrl(folderId),
    action,
  };
}

/** Same as resolveAgentDriveFolder, but takes only the profile id. */
export async function agentDriveFolderById(profileId: string, parentFolderId: string) {
  const supabaseAdmin = await adminClient();
  const { data: agent } = await supabaseAdmin
    .from("profiles")
    .select("id, name, employee_id, phone")
    .eq("id", profileId)
    .maybeSingle();
  if (!agent) return null;
  return resolveAgentDriveFolder(agent, parentFolderId);
}

/**
 * Bring every active agent's folder in line with the current names and root
 * folder. Safe to run repeatedly; nothing is duplicated.
 */
export async function syncAgentDriveFolders(parentFolderId: string) {
  const supabaseAdmin = await adminClient();
  const { data: agents, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, employee_id, phone")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .order("name");
  if (error) throw new Error(error.message);

  const results: AgentFolder[] = [];
  const failures: string[] = [];
  for (const agent of agents ?? []) {
    try {
      results.push(await resolveAgentDriveFolder(agent, parentFolderId));
    } catch (err) {
      failures.push(`${agent.name ?? agent.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    parentFolderId,
    total: (agents ?? []).length,
    created: results.filter((r) => r.action === "created").length,
    renamed: results.filter((r) => r.action === "renamed").length,
    moved: results.filter((r) => r.action === "moved").length,
    recreated: results.filter((r) => r.action === "recreated").length,
    reused: results.filter((r) => r.action === "reused").length,
    folders: results,
    failures,
  };
}

/** Current stored mapping, newest first — for the IT console list. */
export async function listAgentDriveFolders() {
  const supabaseAdmin = await adminClient();
  const { data, error } = await supabaseAdmin
    .from("drive_agent_folders")
    .select("profile_id, folder_id, folder_name, parent_folder_id, last_synced_at")
    .order("folder_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, folder_url: folderUrl(row.folder_id) }));
}
