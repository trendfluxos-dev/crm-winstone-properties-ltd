import { useNavigate } from "@tanstack/react-router";
import { BarChart3, Lock, Server } from "lucide-react";
import { useState } from "react";

import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { Button } from "@/components/ui/button";

/**
 * The two privileged doors out of the Coordinator Deck.
 *
 * Both go through the existing server-side PIN verification — the browser never
 * holds or compares a PIN, it posts the typed value and receives an opaque
 * scoped token. Executive HQ mints the read-only token; the IT Console mints the
 * full one.
 */
export function ElevatedAccessBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"/hq" | "/system">("/hq");

  const ask = (next: "/hq" | "/system") => {
    setTarget(next);
    setOpen(true);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="eyebrow">Elevated access</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          এই দুটি বোর্ড আলাদা পিন দিয়ে খোলে — Executive HQ শুধু দেখার জন্য, IT Console সিস্টেম
          সেটিংস ও অ্যাকাউন্ট অনুমোদনের জন্য।
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" onClick={() => ask("/hq")}>
            <BarChart3 className="size-4" /> Executive HQ
            <Lock className="size-3.5 opacity-60" />
          </Button>
          <Button variant="outline" className="h-10" onClick={() => ask("/system")}>
            <Server className="size-4" /> IT Console
            <Lock className="size-3.5 opacity-60" />
          </Button>
        </div>
      </div>

      <AdminPinDialog
        open={open}
        onOpenChange={setOpen}
        surface={target === "/hq" ? "hq" : "system"}
        onUnlocked={() => void navigate({ to: target })}
      />
    </section>
  );
}
