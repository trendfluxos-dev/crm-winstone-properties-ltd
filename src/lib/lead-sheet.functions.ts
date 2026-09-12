import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Google Sheet lead preview for the import screen (coordinator/authority only). */
const Input = z.object({
  adminToken: z.string().nullable().optional(),
  sheetUrl: z.string().trim().min(20).max(500),
  tab: z.string().trim().max(120).nullable().optional(),
});

export const previewSheetLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireDispatch(caller);
    const { readSheetLeads } = await import("@/lib/lead-sheet.server");
    const result = await readSheetLeads(data.sheetUrl, data.tab ?? null);
    return { tabs: result.tabs, tab: result.tab, rows: result.rows };
  });
