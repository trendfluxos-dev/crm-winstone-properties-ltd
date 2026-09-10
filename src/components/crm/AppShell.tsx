import { Link } from "@tanstack/react-router";
import { Lock, LockOpen, Radio, Smartphone, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { AgentSelector } from "@/components/crm/AgentSelector";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { Button } from "@/components/ui/button";
import { useCrmRealtime } from "@/hooks/use-crm-realtime";
import { setAdminToken, useAdminToken } from "@/lib/local-session";

const APK_URL = "/downloads/winstone-connect.apk";

const NAV = [
  { to: "/", label: "My Leads" },
  { to: "/dispatch", label: "Dispatcher" },
  { to: "/hq", label: "Control Board" },
  { to: "/system", label: "System" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  useCrmRealtime();
  const adminToken = useAdminToken();
  const [pinOpen, setPinOpen] = useState(false);

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
                WINSTONE CONNECT
              </span>
              <span className="block text-[11px] text-muted-foreground">Tele-Sales OS</span>
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

          <div className="ml-auto flex items-center gap-2">
            <AgentSelector />

            <Button
              variant={adminToken ? "secondary" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                if (adminToken) {
                  setAdminToken(null);
                  toast.info("Control board locked");
                } else {
                  setPinOpen(true);
                }
              }}
            >
              {adminToken ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              <span className="hidden lg:inline">{adminToken ? "Admin unlocked" : "Admin PIN"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
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
              <span className="hidden xl:inline">Download Agent Android App</span>
              <span className="xl:hidden">Agent App</span>
            </Button>

            <div className="hidden items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 py-1.5 md:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-live" />
              </span>
              <span className="text-xs font-medium text-live">Live sync</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>

      <footer className="border-t border-border/80 px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        <p>© 2026 TrendFlux Digital. All Rights Reserved.</p>
        <p className="mt-1">Developed &amp; Powered by Zahid Hasan Emon.</p>
      </footer>

      {adminToken && (
        <div className="fixed bottom-5 right-5 z-40">
          <CopilotDrawer
            trigger={
              <Button size="lg" className="gap-2 rounded-full shadow-lg">
                <Sparkles className="size-4" /> AI Copilot
              </Button>
            }
          />
        </div>
      )}

      <AdminPinDialog open={pinOpen} onOpenChange={setPinOpen} />
    </div>
  );
}
