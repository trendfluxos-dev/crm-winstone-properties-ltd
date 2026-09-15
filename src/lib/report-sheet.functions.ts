import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** IT Console report sheet: read rows, and push them to the Google Sheet. */
const Input = z.object({ adminToken: z.string().nullable().optional() });

async function requireSupervisor(adminToken: string | null) {
  const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken);
  requireDispatch(caller);
  return caller;
}

export const reportSheet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Input.extend({ limit: z.number().int().min(10).max(500).default(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireSupervisor(data.adminToken ?? null);
    const { fetchReportSheetRows, readSyncState, reportSheetUrl, REPORT_SHEET_HEADER } =
      await import("@/lib/report-sheet.server");
    const [rows, sync] = await Promise.all([fetchReportSheetRows(data.limit), readSyncState()]);
    return { rows, header: [...REPORT_SHEET_HEADER], sheetUrl: reportSheetUrl(), sync };
  });

export const pushReportSheet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const caller = await requireSupervisor(data.adminToken ?? null);
    const { syncReportsToSheet } = await import("@/lib/report-sheet.server");
    const result = await syncReportsToSheet({ force: true });
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "report_sheet_sync",
      entityType: "call_reports",
      entityId: null,
      metadata: { appended: result.appended },
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "Authority PIN",
    });
    return result;
  });
