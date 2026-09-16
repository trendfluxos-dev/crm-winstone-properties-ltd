import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, Headphones, Lock, Mic, Server, Users } from "lucide-react";
import { useState } from "react";

import logoAsset from "@/assets/winstone-logo.png.asset.json";
import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { ThemeToggle } from "@/components/crm/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useMyAccount } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Winstone Connect — Tele-Sales Entry Hall" },
      {
        name: "description",
        content:
          "Enter Winstone Connect as a sales agent, coordinator, executive or IT administrator. Accounts for agents and coordinators, master PIN for HQ and IT.",
      },
      { property: "og:title", content: "Winstone Connect — Tele-Sales Entry Hall" },
      {
        property: "og:description",
        content: "Four ways in: Sales Agent desk, Coordinator Deck, Executive HQ and IT Console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EntryHall,
});

function EntryHall() {
  const navigate = useNavigate();
  const { scope } = useMyAccount();
  const [pinOpen, setPinOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<"/hq" | "/system">("/hq");

  const openPin = (target: "/hq" | "/system") => {
    setPinTarget(target);
    setPinOpen(true);
  };

  return (
    <div className="grid-noise min-h-screen">
      <main className="mx-auto w-full max-w-5xl animate-rise px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-2 flex justify-end">
          <ThemeToggle />
        </div>
        <header className="flex flex-col items-center text-center">
          <img
            src={logoAsset.url}
            alt="Winstone Properties Ltd. — Find. Build. Invest."
            className="size-16 rounded-full object-cover shadow-sm ring-2 ring-primary/20"
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Winstone Connect</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Tele-Sales Operating System
          </p>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Choose how you are entering today. Agents and coordinators use their own account;
            Executive HQ and the IT Console open with the master PIN.
          </p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <EntryCard
            icon={<Headphones className="size-6" />}
            title="Sales Agent"
            description="Your own lead queue, call log, WhatsApp threads and AI coaching."
            primary={
              <Button asChild className="flex-1">
                <Link to="/auth" search={{ role: "agent", mode: "signin" }}>
                  Sign in
                </Link>
              </Button>
            }
            secondary={
              <Button asChild variant="secondary" className="flex-1">
                <Link to="/auth" search={{ role: "agent", mode: "signup" }}>
                  Create account
                </Link>
              </Button>
            }
          />

          <EntryCard
            icon={<Users className="size-6" />}
            title="Coordinator Deck"
            description="Assign and balance leads, import lists and watch the whole floor queue."
            primary={
              <Button asChild className="flex-1">
                <Link to="/auth" search={{ role: "coordinator", mode: "signin" }}>
                  Log in as Coordinator
                </Link>
              </Button>
            }
          />

          <EntryCard
            icon={<BarChart3 className="size-6" />}
            title="Executive HQ"
            description="Live floor performance, leaderboards and ask-anything reports and charts."
            primary={
              <Button className="flex-1" onClick={() => openPin("/hq")}>
                <Lock className="size-4" /> Unlock PIN
              </Button>
            }
          />

          <EntryCard
            icon={<Server className="size-6" />}
            title="IT Console"
            description="System configuration, integrations, data health and account approvals."
            primary={
              <Button className="flex-1" onClick={() => openPin("/system")}>
                <Lock className="size-4" /> Unlock PIN
              </Button>
            }
          />
        </div>

        {scope !== "none" && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Already signed in —{" "}
            <Link to="/desk" className="font-semibold text-primary hover:underline">
              go to my desk
            </Link>
          </p>
        )}

        <footer className="mt-14 text-center text-xs text-muted-foreground">
          <p>© 2026 TrendFlux Digital. All Rights Reserved.</p>
          <p className="mt-1">Developed &amp; Powered by Zahid Hasan Emon.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <span className="hidden sm:inline">·</span>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <span className="hidden sm:inline">·</span>
            <Link
              to="/voice-transcription"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Mic className="size-3" /> Voice Transcription
            </Link>
          </div>
        </footer>
      </main>

      <AdminPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        surface={pinTarget === "/hq" ? "hq" : "system"}
        onUnlocked={() => void navigate({ to: pinTarget })}
      />
    </div>
  );
}

function EntryCard({
  icon,
  title,
  description,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <section className="card-elevated flex flex-col gap-3 p-5">
      <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {primary}
        {secondary}
      </div>
    </section>
  );
}
