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
    return { rows, scope: data.scope };
  });

/** Manual "generate now" for the window that already closed today. */
export const generateShiftSummaryNow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: z.string().nullable().optional() }).parse(input))
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
