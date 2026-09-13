import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  adminToken: z.string().nullable().optional(),
  scope: z.enum(["hq", "it"]).default("hq"),
});

/** Shift summaries for management surfaces. HQ sees the rolling month, IT sees all. */
export const shiftSummaries = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { listShiftSummaries } = await import("@/lib/shift-summary.server");
    const rows = await listShiftSummaries(data.scope, data.scope === "it" ? 200 : 60);
    const { shiftDriveLinks } = await import("@/lib/shift-drive.server");
    const driveLinks = await shiftDriveLinks(rows.map((row) => row.shift_key));
    return { rows, scope: data.scope, driveLinks };
  });

/** Manual "generate now" for the window that already closed today. */
export const generateShiftSummaryNow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));
    const { generateShiftSummary } = await import("@/lib/shift-summary.server");
    return generateShiftSummary();
  });

/**
 * Live sheet for the shift that is running right now, recomputed on each call so
 * an update an agent just submitted appears immediately in the IT Console.
 */
export const liveShiftSheetNow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { liveShiftSheet } = await import("@/lib/shift-summary.server");
    return liveShiftSheet();
  });

/** Rebuilds summaries for windows that already closed on the last two weeks. */
export const backfillShiftSummariesNow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));
    const { backfillShiftSummaries } = await import("@/lib/shift-summary.server");
    return backfillShiftSummaries();
  });

/** Uploads one stored summary to the company Drive shift folder on demand. */
export const exportShiftSummaryToDrive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ adminToken: z.string().nullable().optional(), shiftKey: z.string().min(3) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { getDriveBackupSettings } = await import("@/lib/recording-drive.server");
    const settings = await getDriveBackupSettings();
    if (!settings.enabled) throw new Error("Google Drive ব্যাকআপ বন্ধ আছে");
    const { backupShiftSummaryToDrive } = await import("@/lib/shift-drive.server");
    return backupShiftSummaryToDrive(data.shiftKey);
  });

/** Writes one stored summary into the Google Sheets "শিফট সামারি" tab on demand. */
export const exportShiftSummaryToSheets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ adminToken: z.string().nullable().optional(), shiftKey: z.string().min(3) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { appendShiftSummaryToSheetQuietly, shiftSheetUrl } = await import(
      "@/lib/shift-sheet.server"
    );
    const result = await appendShiftSummaryToSheetQuietly(data.shiftKey);
    if (!result) throw new Error("Google Sheets-এ লেখা যায়নি — সংযোগ বা সামারি পরীক্ষা করুন");
    return { ...result, sheetUrl: shiftSheetUrl() };
  });
