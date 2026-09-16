import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Lock, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import logoAsset from "@/assets/winstone-logo.png.asset.json";
import { AdminPinDialog } from "@/components/crm/AdminPinDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { resolveSignInEmail } from "@/lib/accounts.functions";
import { ensureRegistered, saveSignupDraft } from "@/lib/session";

const SearchSchema = z.object({
  role: z.enum(["agent", "coordinator"]).catch("agent"),
  mode: z.enum(["signin", "signup"]).catch("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => SearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Sign in — Winstone Connect" },
      {
        name: "description",
        content:
          "Sales agents and team coordinators sign in to their Winstone Connect desk, or create an account for approval.",
      },
      { property: "og:title", content: "Sign in — Winstone Connect" },
      {
        property: "og:description",
        content: "Agent and coordinator access to the Winstone Connect tele-sales floor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const ROLE_LABEL = { agent: "Sales Agent", coordinator: "Coordinator Deck" } as const;

function AuthPage() {
  const { role, mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<"/hq" | "/system">("/hq");

  const openPin = (target: "/hq" | "/system") => {
    setPinTarget(target);
    setPinOpen(true);
  };

  const signIn = useMutation({
    mutationFn: async () => {
      const loginId = email.trim();
      const resolved = loginId.includes("@")
        ? loginId
        : (await resolveSignInEmail({ data: { identifier: loginId } })).email;
      const { error } = await supabase.auth.signInWithPassword({ email: resolved, password });
      if (error) throw new Error(error.message);
      await ensureRegistered(name);
    },
    onSuccess: () => {
      toast.success("Signed in");
      void navigate({ to: "/desk" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const signUp = useMutation({
    mutationFn: async () => {
      saveSignupDraft({ name, phone, requestedRole: role });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message);
      if (data.session) await ensureRegistered(name);
      return Boolean(data.session);
    },
    onSuccess: (hasSession) => {
      if (hasSession) {
        toast.success("Account created — waiting for approval");
        void navigate({ to: "/desk" });
      } else {
        toast.success("Account created — confirm your email, then sign in");
        void navigate({ to: "/auth", search: { role, mode: "signin" } });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isSignup = mode === "signup";
  const busy = signIn.isPending || signUp.isPending;
  const canSubmit =
    (isSignup ? email.includes("@") : email.trim().length >= 4) &&
    password.length >= 6 &&
    (!isSignup || name.trim().length >= 2);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="card-elevated w-full max-w-md bg-card p-6">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="Winstone Properties Ltd. logo"
            className="size-11 rounded-full object-cover ring-1 ring-primary/40"
          />
          <span>
            <span className="block text-sm font-bold tracking-tight">Winstone Connect</span>
            <span className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {ROLE_LABEL[role]}
            </span>
          </span>
        </Link>

        <h1 className="mt-6 text-xl font-bold tracking-tight">
          {isSignup ? "Create your account" : "Sign in to your desk"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignup
            ? "A supervisor approves new accounts before the floor data opens up."
            : "ফোন নম্বর, Employee ID অথবা ইমেইল — যেটা সহজ, সেটাই দিন।"}
        </p>

        <div className="mt-5 space-y-3">
          {isSignup && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mst. Soniya Yeasmin"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01805049668"
                  inputMode="tel"
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">{isSignup ? "Email" : "ফোন / Employee ID / ইমেইল"}</Label>
            <Input
              id="email"
              type={isSignup ? "email" : "text"}
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isSignup ? "you@winstonebd.com" : "01805049668 বা WIN2601"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit && !busy) {
                  if (isSignup) signUp.mutate();
                  else signIn.mutate();
                }
              }}
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || busy}
            onClick={() => (isSignup ? signUp.mutate() : signIn.mutate())}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isSignup ? (
              <UserPlus className="size-4" />
            ) : (
              <LogIn className="size-4" />
            )}
            {isSignup ? "Create account" : "Sign in"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              to="/auth"
              search={{ role, mode: isSignup ? "signin" : "signup" }}
              className="font-semibold text-primary hover:underline"
            >
              {isSignup ? "Sign in" : "Create account"}
            </Link>
          </p>
          <div className="mt-2 border-t border-border pt-4">
            <p className="text-center text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Or unlock with the master PIN
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => openPin("/hq")}>
                <Lock className="size-4" /> Executive HQ
              </Button>
              <Button variant="secondary" onClick={() => openPin("/system")}>
                <Lock className="size-4" /> IT Console
              </Button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">
              Back to the entry hall
            </Link>
          </p>
        </div>
      </div>

      <AdminPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        surface={pinTarget === "/hq" ? "hq" : "system"}
        onUnlocked={() => void navigate({ to: pinTarget })}
      />
    </div>
  );
}
