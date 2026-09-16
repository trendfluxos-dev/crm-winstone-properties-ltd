import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Non-breaking update notice for the installed web app.
 *
 * Watches the already-registered offline shell worker. When a newer build has
 * been installed it offers a restart — nothing reloads on its own, so an agent
 * in the middle of a report is never interrupted and the offline queue is
 * untouched.
 */
export function AppUpdatePrompt() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) return;

    let cancelled = false;

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration || cancelled) return;

      const check = () => {
        if (registration.waiting && navigator.serviceWorker.controller) setReady(true);
      };
      check();

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setReady(true);
          }
        });
      });

      void registration.update().catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <RefreshCw className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        অ্যাপের নতুন সংস্করণ প্রস্তুত — কাজ শেষ করে রিস্টার্ট দিলে সেটি চালু হবে। এখনকার কোনো
        কাজ হারাবে না।
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        রিস্টার্ট করুন
      </Button>
    </div>
  );
}
