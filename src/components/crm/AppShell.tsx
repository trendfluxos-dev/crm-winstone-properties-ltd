import { Link } from "@tanstack/react-router";
import { Lock, LockOpen, Radio, Smartphone, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AboutLegalModal } from "@/components/crm/AboutLegalModal";
import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { AgentSelector } from "@/components/crm/AgentSelector";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { Button } from "@/components/ui/button";
import { useCrmRealtime } from "@/hooks/use-crm-realtime";
import { setAdminToken, useAdminToken } from "@/lib/local-session";

const APK_URL = "/downloads/winstone-connect.apk";

const NAV = [
  { to: "/", label: "Agent Queue" },
  { to: "/dispatch", label: "Coordinator Deck" },
  { to: "/hq", label: "Executive HQ" },
  { to: "/system", label: "IT Console" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  useCrmRealtime();
  const adminToken = useAdminToken();
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div className="min-h-screen grid-noise">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Radio className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block whitespace-nowrap text-[13px] font-bold tracking-tight">Winstone Connect</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Tele-Sales OS
              </span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 rounded-full border border-border bg-surface-2/70 p-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-300 hover:text-foreground data-[status=active]:bg-card data-[status=active]:text-primary data-[status=active]:shadow-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <AgentSelector />


            <button
              type="button"
              onClick={() => {
                if (adminToken) {
                  setAdminToken(null);
                  toast.info("Control board locked");
                } else {
                  setPinOpen(true);
                }
              }}
              className={
                adminToken
                  ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/25 bg-accent px-3 text-xs font-semibold text-accent-foreground transition-all duration-300 hover:shadow-sm"
                  : "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-all duration-300 hover:text-foreground hover:shadow-sm"
              }
            >
              {adminToken ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
              <span className="hidden lg:inline">{adminToken ? "Authority unlocked" : "Master PIN"}</span>
            </button>

            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3.5 text-xs font-semibold shadow-sm transition-all duration-300 hover:shadow-md"
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
              <Smartphone className="size-3.5" />
              <span className="hidden xl:inline">Download Agent Android App</span>
              <span className="xl:hidden">Agent App</span>
            </Button>

            <div className="hidden h-8 items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 md:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-live" />
              </span>
              <span className="text-[11px] font-semibold text-live">Live</span>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground data-[status=active]:border-primary/30 data-[status=active]:bg-accent data-[status=active]:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1600px] animate-rise px-3 py-5 sm:px-6 sm:py-6">{children}</main>

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        <p>© 2026 TrendFlux Digital. All Rights Reserved.</p>
        <p className="mt-1">Developed &amp; Powered by Zahid Hasan Emon.</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link
            to="/privacy"
            className="transition-colors hover:text-foreground"
            activeOptions={{ exact: true }}
          >
            Privacy Policy
          </Link>
          <span className="hidden sm:inline">·</span>
          <Link
            to="/terms"
            className="transition-colors hover:text-foreground"
            activeOptions={{ exact: true }}
          >
            Terms of Service
          </Link>
        </div>
      </footer>

      {adminToken && (
        <div className="fixed bottom-5 right-5 z-40">
          <CopilotDrawer
            trigger={
              <Button size="lg" className="gap-2 rounded-full shadow-md transition-all duration-300 hover:shadow-lg">
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
