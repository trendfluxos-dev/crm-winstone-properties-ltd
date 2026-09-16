import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Lock, LockOpen, LogOut, Smartphone, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import apkAsset from "@/assets/winstone-connect.apk.asset.json";
import logoAsset from "@/assets/winstone-logo.png.asset.json";
import { AboutLegalModal } from "@/components/crm/AboutLegalModal";
import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { AppUpdatePrompt } from "@/components/crm/AppUpdatePrompt";
import { InstallAppButton } from "@/components/crm/InstallAppButton";
import { AgentSelector } from "@/components/crm/AgentSelector";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { OfflineSyncBar } from "@/components/crm/OfflineSyncBar";
import { ThemeToggle } from "@/components/crm/ThemeToggle";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCrmRealtime } from "@/hooks/use-crm-realtime";
import { setAdminToken, useAdminToken } from "@/lib/local-session";
import { useMyAccount, useSignOut } from "@/lib/session";

// Latest build is streamed from the backend; the bundled asset stays as a fallback.
const APK_URL = "/api/public/download/apk";
void apkAsset;

type Scope = "authority" | "coordinator" | "agent" | "none";

type NavItem = { to: string; label: string; scopes: readonly Scope[] };

/**
 * Navigation hierarchy. Every route stays reachable and every scope rule is
 * unchanged — only the level at which a link is surfaced differs: five daily
 * workspaces stay in the bar, the rest group under "More".
 */
const PRIMARY_NAV: readonly NavItem[] = [
  { to: "/", label: "Home", scopes: ["authority", "coordinator", "agent", "none"] },
  { to: "/desk", label: "My Desk", scopes: ["coordinator", "agent"] },
  { to: "/coach", label: "AI Coach", scopes: ["authority", "coordinator", "agent"] },
  { to: "/dispatch", label: "Coordinator Deck", scopes: ["authority", "coordinator"] },
  { to: "/hq", label: "Executive HQ", scopes: ["authority"] },
  { to: "/reports", label: "Reports", scopes: ["authority", "coordinator", "agent"] },
];

const MORE_NAV: readonly { group: string; items: readonly NavItem[] }[] = [
  {
    group: "Operations",
    items: [
      { to: "/customers", label: "Customers", scopes: ["authority", "coordinator", "agent"] },
      { to: "/inbox", label: "Support Inbox", scopes: ["authority", "coordinator", "agent"] },
      { to: "/tickets", label: "Tickets", scopes: ["authority", "coordinator", "agent"] },
      { to: "/playbook", label: "প্লেবুক", scopes: ["authority", "coordinator", "agent"] },
    ],
  },
  {
    group: "Administration",
    items: [
      { to: "/system", label: "IT Console", scopes: ["authority"] },
      { to: "/ingest", label: "Ingest Check", scopes: ["authority"] },
      { to: "/docs-admin", label: "Docs Admin", scopes: ["authority", "coordinator"] },
      { to: "/support-admin", label: "Support Admin", scopes: ["authority", "coordinator"] },
    ],
  },
  {
    group: "Resources",
    items: [
      { to: "/docs", label: "Docs", scopes: ["authority", "coordinator", "agent", "none"] },
      {
        to: "/install",
        label: "অ্যাপ ইনস্টল",
        scopes: ["authority", "coordinator", "agent", "none"],
      },
      { to: "/help", label: "Help Centre", scopes: ["authority", "coordinator", "agent", "none"] },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  useCrmRealtime();
  const adminToken = useAdminToken();
  const { scope } = useMyAccount();
  const signOut = useSignOut();
  const [pinOpen, setPinOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = (item: NavItem) => item.scopes.includes(scope as Scope);
  const primary = PRIMARY_NAV.filter(allowed);
  const moreGroups = MORE_NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter(
    (g) => g.items.length > 0,
  );
  const moreActive = moreGroups.some((g) => g.items.some((i) => pathname.startsWith(i.to)));

  return (
    <div className="min-h-screen grid-noise">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2.5">
            <img
              src={logoAsset.url}
              alt="Winstone Properties Ltd. logo"
              className="size-9 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold tracking-tight">
                Winstone Connect
              </span>
              <span className="hidden truncate text-[10px] font-medium uppercase tracking-[0.18em] text-primary/70 sm:block">
                Tele-Sales OS
              </span>
            </span>
          </Link>

          <nav className="ml-3 hidden min-w-0 items-center gap-1 lg:flex">
            {primary.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground data-[status=active]:font-semibold data-[status=active]:text-foreground data-[status=active]:after:absolute data-[status=active]:after:inset-x-2.5 data-[status=active]:after:-bottom-0.5 data-[status=active]:after:h-0.5 data-[status=active]:after:rounded-full data-[status=active]:after:bg-primary data-[status=active]:after:content-['']"
              >
                {item.label}
              </Link>
            ))}
            {moreGroups.length > 0 && <MoreMenu groups={moreGroups} active={moreActive} />}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {adminToken && <AgentSelector />}

            <ThemeToggle />

            <InstallAppButton />

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
                  ? "inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-accent px-3 text-xs font-semibold text-accent-foreground transition-colors duration-200"
                  : "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground transition-colors duration-200 hover:border-primary/35 hover:text-foreground"
              }
            >
              {adminToken ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
              <span className="hidden lg:inline">
                {adminToken ? "Authority unlocked" : "Unlock PIN"}
              </span>
            </button>

            {scope !== "none" && !adminToken && (
              <button
                type="button"
                aria-label="Sign out"
                onClick={() => {
                  void signOut().then(() => toast.info("Signed out"));
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-muted-foreground transition-colors duration-200 hover:border-primary/35 hover:text-foreground sm:px-3"
              >
                <LogOut className="size-3.5 sm:hidden" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}

            <Button
              size="sm"
              aria-label="Download Agent Android App"
              className="h-8 shrink-0 gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors duration-200 sm:px-3.5"
              onClick={() => {
                const a = document.createElement("a");
                a.href = APK_URL;
                a.download = "winstone-connect.apk";
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success("Agent app download started");
              }}
            >
              <Smartphone className="size-3.5" />
              <span className="hidden xl:inline">Download Agent Android App</span>
              <span className="hidden sm:inline xl:hidden">Agent App</span>
            </Button>

            <div className="hidden h-8 items-center gap-2 rounded-md border border-border px-3 md:flex">
              <span className="status-dot text-success" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">
                Live
              </span>
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {primary.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="shrink-0 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground data-[status=active]:border-primary data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {moreGroups.length > 0 && <MoreMenu groups={moreGroups} active={moreActive} compact />}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1600px] animate-rise px-3 py-5 sm:px-6 sm:py-6">
        <OfflineSyncBar />
        <AppUpdatePrompt />
        {children}
      </main>

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
          <span className="hidden sm:inline">·</span>
          <AboutLegalModal />
        </div>
      </footer>

      {adminToken && (
        <div className="fixed bottom-5 right-5 z-40">
          <CopilotDrawer
            trigger={
              <Button
                size="lg"
                className="gap-2 rounded-full shadow-md transition-all duration-300 hover:shadow-lg"
              >
                <Sparkles className="size-4" /> AI Copilot
              </Button>
            }
          />
        </div>
      )}

      {/* On Executive HQ the same button must mint the read-only HQ token,
          so the audit record and the granted scope match the surface. */}
      <AdminPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        surface={pathname.startsWith("/hq") ? "hq" : "system"}
      />
    </div>
  );
}

/** Grouped overflow menu: every non-daily route, one tap away, same RBAC. */
function MoreMenu({
  groups,
  active,
  compact = false,
}: {
  groups: { group: string; items: readonly NavItem[] }[];
  active: boolean;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          compact
            ? `shrink-0 inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium ${active ? "border-primary bg-accent font-semibold text-foreground" : "border-border text-muted-foreground"}`
            : `inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-2 hover:text-foreground ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`
        }
      >
        More <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {groups.map((group, index) => (
          <div key={group.group}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {group.group}
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem key={item.to} asChild>
                <Link
                  to={item.to}
                  className="cursor-pointer data-[status=active]:font-semibold data-[status=active]:text-foreground"
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
