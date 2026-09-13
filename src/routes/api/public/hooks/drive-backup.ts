import { createFileRoute } from "@tanstack/react-router";

/**
 * Nightly Google Drive backup: copies the Dhaka day's call recordings and the
 * daily recording index document into the company Drive folder. Runs only when
 * IT has switched the backup on with a folder. Caller must present the cron
 * secret, same shared secret as the shift summary job.
 */
export const Route = createFileRoute("/api/public/hooks/drive-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: stored } = await supabaseAdmin
          .from("system_settings")
          .select("value")
          .eq("key", "shift_cron_secret")
          .maybeSingle();
        const storedSecret =
          stored && typeof stored.value === "object" && stored.value !== null
            ? (stored.value as { secret?: string }).secret
            : undefined;

        const accepted = [
          process.env["SHIFT_CRON_SECRET"],
          process.env["LOVABLE_CRON_SECRET"],
          storedSecret,
        ].filter((value): value is string => Boolean(value));
        if (accepted.length === 0 || !header || !accepted.includes(header)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { getDriveBackupSettings, syncDayRecordingsToDrive, backupRecordingDocToDrive } =
            await import("@/lib/recording-drive.server");
          const settings = await getDriveBackupSettings();
          if (!settings.enabled || !settings.folderId) {
            return Response.json({ ok: true, skipped: "drive_backup_disabled" });
          }

          const url = new URL(request.url);
          const dateKey =
            url.searchParams.get("date") ??
            new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

          const recordings = await syncDayRecordingsToDrive(dateKey);
          let doc: unknown = null;
          try {
            doc = await backupRecordingDocToDrive(dateKey);
          } catch (error) {
            doc = { error: error instanceof Error ? error.message : "failed" };
          }

          return Response.json({ ok: true, dateKey, recordings, doc });
        } catch (error) {
          console.error("drive backup job failed", error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
