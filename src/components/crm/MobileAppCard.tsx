import { Link } from "@tanstack/react-router";
import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Release = { version_code: number; version_name: string } | null;

/**
 * Concise install/update entry point for agents and coordinators.
 * Version text only appears when a real release row exists.
 */
export function MobileAppCard() {
  const [release, setRelease] = useState<Release>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/public/agent/version?version_code=0", {
      headers: { accept: "application/json" },
    })
      .then((res) => res.json())
      .then((body: { latest: Release }) => {
        if (!cancelled) setRelease(body.latest ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="size-4 text-primary" /> Winstone Connect Android অ্যাপ
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          কল রেকর্ডিং ও অটো সিঙ্কের জন্য ফোনে অ্যাপটি ইনস্টল করুন — একই CRM লগইন দিয়েই চলবে।
          {release ? ` সর্বশেষ ভার্সন v${release.version_name}।` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="h-9">
          <a href="/api/public/download/apk">
            <Download className="size-4" /> APK ডাউনলোড
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-9">
          <Link to="/install">ইনস্টল গাইড</Link>
        </Button>
      </div>
    </section>
  );
}
