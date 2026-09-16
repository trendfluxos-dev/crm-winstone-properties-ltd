import { createFileRoute } from "@tanstack/react-router";

import apkAsset from "@/assets/winstone-connect.apk.asset.json";

/**
 * Serves the latest Winstone Connect agent APK.
 *
 * Preferred source is the signed build IT published through the console, which
 * lives in the private "app-downloads" bucket. When no build has been published
 * yet, the request falls back to the APK bundled with this project so phones
 * still receive a real installer instead of a dead link.
 */
export const Route = createFileRoute("/api/public/download/apk")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.storage
          .from("app-downloads")
          .download("winstone-connect.apk");

        if (data) {
          return new Response(data, {
            headers: {
              "Content-Type": "application/vnd.android.package-archive",
              "Content-Disposition": 'attachment; filename="winstone-connect.apk"',
              "Cache-Control": "public, max-age=300",
            },
          });
        }

        // No published build in storage — hand over the bundled signed APK.
        if (apkAsset?.url) {
          return new Response(null, {
            status: 302,
            headers: { Location: apkAsset.url, "Cache-Control": "no-store" },
          });
        }

        return new Response("App file is not available right now", { status: 404 });
      },
    },
  },
});
