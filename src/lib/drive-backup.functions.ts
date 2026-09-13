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

export const getDriveBackupSettingsFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    return getDriveBackupSettings();
  });

export const saveDriveBackupSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { enabled: boolean; folderId?: string | null }) => input)
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    return saveDriveBackupSettings({
      enabled: data.enabled,
      folderId: data.folderId ?? null,
      actorProfileId: caller.profile?.id ?? null,
    });
  });

export const initializeDriveBackupFolderFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    return initializeDriveBackupFolder();
  });

export const syncRecordingsToDriveFn = createServerFn({ method: "POST" })
  .inputValidator((input: { dateKey: string }) => input)
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    const result = await syncDayRecordingsToDrive(data.dateKey);
    return { dateKey: data.dateKey, ...result };
  });

export const syncRecordingDocToDriveFn = createServerFn({ method: "POST" })
  .inputValidator((input: { dateKey: string }) => input)
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    return backupRecordingDocToDrive(data.dateKey);
  });

export const backupSingleRecordingToDriveFn = createServerFn({ method: "POST" })
  .inputValidator((input: { recordingId: string }) => z.object({ recordingId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    return backupRecordingToDrive(data.recordingId);
  });

/** Realign every active agent's Drive folder (create / rename / move). */
export const syncAgentDriveFoldersFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    const settings = await getDriveBackupSettings();
    if (!settings.enabled) throw new Error("Google Drive ব্যাকআপ বন্ধ আছে");
    if (!settings.folderId) throw new Error("Google Drive ফোল্ডার আইডি দেওয়া হয়নি");
    const { syncAgentDriveFolders } = await import("./drive-agent-folders.server");
    return syncAgentDriveFolders(settings.folderId);
  });

/** Current agent → Drive folder mapping for the IT Console list. */
export const listAgentDriveFoldersFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller();
    requireAuthority(caller);
    const { listAgentDriveFolders } = await import("./drive-agent-folders.server");
    return listAgentDriveFolders();
  });
