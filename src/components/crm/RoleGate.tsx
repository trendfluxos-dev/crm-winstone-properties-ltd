import { Link } from "@tanstack/react-router";
import { Lock, LogIn } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { Button } from "@/components/ui/button";
import { useMyAccount, type Account } from "@/lib/session";

type Scope = Account["scope"];

/**
 * Shows a board only to the roles that own it. Everyone else gets the right
 * way in: the master PIN for HQ / IT boards, or account sign-in for desks.
 */
export function RoleGate({
  allow,
  title,
  description,
  icon,
  children,
  surface = "system",
}: {
  allow: Scope[];
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  /** Which board is behind this gate — HQ unlocks read-only. */
  surface?: "hq" | "system";
}) {
  const { scope, isPending } = useMyAccount();
  const [pinOpen, setPinOpen] = useState(false);

  if (isPending) return <SnapshotSkeleton />;
  if (allow.includes(scope)) return <>{children}</>;

  const pinAllowed = allow.includes("authority");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {pinAllowed && (
          <Button size="lg" onClick={() => setPinOpen(true)}>
            <Lock className="size-4" /> পিন দিন
          </Button>
        )}
        <Button size="lg" variant={pinAllowed ? "secondary" : "default"} asChild>
          <Link to="/auth" search={{ role: "agent", mode: "signin" }}>
            <LogIn className="size-4" /> সাইন ইন
          </Link>
        </Button>
      </div>
      <AdminPinDialog open={pinOpen} onOpenChange={setPinOpen} surface={surface} />
    </div>
  );
}
