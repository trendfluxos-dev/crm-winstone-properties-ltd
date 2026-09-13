import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, KeyRound, Loader2, LogOut, Palette } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { updateMyProfile } from "@/lib/accounts.functions";
import { useMyAccount, useSignOut } from "@/lib/session";

const HUES = [200, 260, 320, 20, 60, 140];

/** Agents and coordinators keep their own name, phone and avatar colour here. */
export function MyProfileCard() {
  const { account } = useMyAccount();
  const queryClient = useQueryClient();
  const save = useServerFn(updateMyProfile);
  const signOut = useSignOut();

  const profile = account?.profile ?? null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [hue, setHue] = useState(profile?.avatar_hue ?? 200);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const changePassword = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("পাসওয়ার্ড পরিবর্তন হয়েছে");
      setPw1("");
      setPw2("");
      setPwOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutation = useMutation({
    mutationFn: () => save({ data: { name, phone, avatarHue: hue } }),
    onSuccess: () => {
      toast.success("Profile updated");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["my-account"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!profile) return null;

  return (
    <section className="card-elevated p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: `hsl(${profile.avatar_hue} 65% 45%)` }}
          >
            {profile.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.role === "team_leader" ? "Coordinator" : "Sales agent"}
              {profile.employee_id ? ` · ${profile.employee_id}` : ""}
              {profile.email ? ` · ${profile.email}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setOpen((v) => !v)}
          >
            <Palette className="size-4" /> Edit profile
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setPwOpen((v) => !v)}
          >
            <KeyRound className="size-4" /> পাসওয়ার্ড বদল
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="my-name">Name</Label>
            <Input id="my-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="my-phone">Phone</Label>
            <Input
              id="my-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Avatar colour</Label>
            <div className="flex gap-2">
              {HUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHue(value)}
                  className="grid size-8 place-items-center rounded-full ring-2 ring-transparent data-[on=true]:ring-primary"
                  data-on={hue === value}
                  style={{ backgroundColor: `hsl(${value} 65% 45%)` }}
                  aria-label={`Colour ${value}`}
                >
                  {hue === value && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={name.trim().length < 2 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save profile
            </Button>
          </div>
        </div>
      )}

      {pwOpen && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="my-pw1">নতুন পাসওয়ার্ড</Label>
            <Input
              id="my-pw1"
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="কমপক্ষে ৬ অক্ষর"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="my-pw2">আবার লিখুন</Label>
            <Input
              id="my-pw2"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={pw1.length < 6 || pw1 !== pw2 || changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              {changePassword.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              পাসওয়ার্ড সংরক্ষণ
            </Button>
            {pw1.length > 0 && pw1 !== pw2 && (
              <p className="mt-2 text-xs text-destructive">দুইটি পাসওয়ার্ড মিলছে না</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
