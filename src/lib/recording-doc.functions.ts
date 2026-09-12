/**
 * HQ / IT Console action: write one day's recording index into Google Docs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  adminToken: z.string().nullable().optional(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const recordingDocSync = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope !== "authority" && caller.scope !== "coordinator") {
      throw new Error("শুধুমাত্র HQ বা কোঅর্ডিনেটর এই ডকুমেন্ট তৈরি করতে পারবেন");
    }

    const { syncRecordingDoc } = await import("@/lib/recording-doc.server");
    const result = await syncRecordingDoc(data.dateKey);

    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      action: "recording_doc_synced",
      actorId: caller.profileId ?? null,
      detail: { dateKey: result.dateKey, calls: result.calls, recordings: result.recordings },
    });

    return result;
  });
