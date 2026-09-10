import { Link } from "@tanstack/react-router";
import { Radio, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCrmRealtime } from "@/hooks/use-crm-realtime";

const APK_URL = "/downloads/winstone-connect.apk";

const NAV = [
  { to: "/", label: "Executive HQ" },
  { to: "/leads", label: "Lead Queue" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  useCrmRealtime();

  return (
    <div className="min-h-screen grid-noise">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-primary/15 text-primary">
              <Radio className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-bold tracking-wide">
                TELE-SALES CRM OS
              </span>
              <span className="block text-[11px] text-muted-foreground">Winstone Command Center</span>
            </span>
          </Link>

          <nav className="ml-2 flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            onClick={async () => {
              try {
                const res = await fetch(APK_URL, { method: "HEAD" });
                if (!res.ok) throw new Error("missing");
              } catch {
                toast.error("Agent app file is not uploaded yet", {
                  description: "Place winstone-connect.apk in public/downloads/ to enable the download.",
                });
                return;
              }
              const a = document.createElement("a");
              a.href = APK_URL;
              a.download = "winstone-connect.apk";
              document.body.appendChild(a);
              a.click();
              a.remove();
            }}
          >
            <Smartphone className="size-4" />
            <span className="hidden sm:inline">Download Agent Android App</span>
            <span className="sm:hidden">Agent App</span>
          </Button>

          <div className="flex items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 py-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-live" />
            </span>
            <span className="text-xs font-medium text-live">Live sync</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
