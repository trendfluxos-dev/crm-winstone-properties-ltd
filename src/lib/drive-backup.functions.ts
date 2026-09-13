import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  backupRecordingDocToDrive,
  backupRecordingToDrive,
  getDriveBackupSettings,
  initializeDriveBackupFolder,
  saveDriveBackupSettings,
  syncDayRecordingsToDrive,
} from "./recording-drive.server";

/**
 * The IT Console can be unlocked with the master PIN alone, with no Supabase
 * session, so every function here must accept that PIN token — resolving the
 * caller without it fails for a PIN-only operator.
 */
type WithToken = { adminToken?: string | null };

async function authority(adminToken?: string | null) {
  const { resolveCaller, requireAuthority } = await import("./access.server");
  const caller = await resolveCaller(adminToken ?? null);
  requireAuthority(caller);
  return caller;
}

export const getDriveBackupSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken) => input)
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    return getDriveBackupSettings();
  });

export const saveDriveBackupSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken & { enabled: boolean; folderId?: string | null }) => input)
  .handler(async ({ data }) => {
    const { requireWrite } = await import("./access.server");
    const caller = await authority(data.adminToken);
    requireWrite(caller);
    return saveDriveBackupSettings({
      enabled: data.enabled,
      folderId: data.folderId ?? null,
      actorProfileId: caller.profile?.id ?? null,
    });
  });

export const initializeDriveBackupFolderFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken) => input)
  .handler(async ({ data }) => {
    const { requireWrite } = await import("./access.server");
    const caller = await authority(data.adminToken);
    requireWrite(caller);
    return initializeDriveBackupFolder();
  });

export const syncRecordingsToDriveFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken & { dateKey: string }) => input)
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    const result = await syncDayRecordingsToDrive(data.dateKey);
    return { dateKey: data.dateKey, ...result };
  });

export const syncRecordingDocToDriveFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken & { dateKey: string }) => input)
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    return backupRecordingDocToDrive(data.dateKey);
  });

export const backupSingleRecordingToDriveFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken & { recordingId: string }) =>
    z
      .object({ recordingId: z.string().uuid(), adminToken: z.string().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    return backupRecordingToDrive(data.recordingId);
  });

/** Realign every active agent's Drive folder (create / rename / move). */
export const syncAgentDriveFoldersFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken) => input)
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    const settings = await getDriveBackupSettings();
    if (!settings.enabled) throw new Error("Google Drive ব্যাকআপ বন্ধ আছে");
    if (!settings.folderId) throw new Error("Google Drive ফোল্ডার আইডি দেওয়া হয়নি");
    const { syncAgentDriveFolders } = await import("./drive-agent-folders.server");
    return syncAgentDriveFolders(settings.folderId);
  });

/** Current agent → Drive folder mapping for the IT Console list. */
export const listAgentDriveFoldersFn = createServerFn({ method: "POST" })
  .inputValidator((input: WithToken) => input)
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    const { listAgentDriveFolders } = await import("./drive-agent-folders.server");
    return listAgentDriveFolders();
  });
