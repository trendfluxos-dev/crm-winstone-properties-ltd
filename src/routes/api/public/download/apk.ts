import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves the latest Winstone Connect agent APK.
 *
 * The binary lives in the private "app-downloads" bucket; this route streams it
 * back with the Android installer content type so phones install it instead of
 * unzipping it.
 */
export const Route = createFileRoute("/api/public/download/apk")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("app-downloads")
          .download("winstone-connect.apk");
        if (error || !data) {
          return new Response("App file is not available right now", { status: 404 });
        }
        return new Response(data, {
          headers: {
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition": 'attachment; filename="winstone-connect.apk"',
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
