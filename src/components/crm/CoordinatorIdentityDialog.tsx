import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmCoordinatorEntry, confirmMyIdentity } from "@/lib/accounts.functions";
import { useMyAccount } from "@/lib/session";

/**
 * Required identity confirmation after a coordinator signs in.
 *
 * This is not a login step and cannot replace one: it only appears for a caller
 * the server has already authenticated as a coordinator, and the details are
 * written to that caller's own profile row. It stays open until the profile
 * carries a name, Employee ID and phone number.
 */
export function CoordinatorIdentityDialog() {
  const { scope, account, isPending } = useMyAccount();
  const profile = account?.profile ?? null;
  const queryClient = useQueryClient();
  const save = useServerFn(confirmMyIdentity);

  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem("winstone.coordinator.entered") === "1";
  });

  const logEntry = useServerFn(confirmCoordinatorEntry);
  const enter = useMutation({
    mutationFn: () => logEntry({ data: { adminToken: null } }),
    onSuccess: () => {
      window.sessionStorage.setItem("winstone.coordinator.entered", "1");
      setEntered(true);
    },
    onError: (err: Error) => toast.error("প্রবেশ নথিভুক্ত হয়নি", { description: err.message }),
  });

  const incomplete =
    scope === "coordinator" &&
    Boolean(profile) &&
    (!profile?.name?.trim() || !profile?.employee_id?.trim() || !profile?.phone?.trim());

  useEffect(() => {
    if (!profile) return;
    setName((current) => current || profile.name || "");
    setEmployeeId((current) => current || profile.employee_id || "");
    setPhone((current) => current || profile.phone || "");
  }, [profile]);

  const submit = useMutation({
    mutationFn: () =>
      save({ data: { name: name.trim(), employeeId: employeeId.trim(), phone: phone.trim() } }),
    onSuccess: () => {
      toast.success("পরিচয় নিশ্চিত হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["my-account"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  // Identity complete: one confirmation of who is entering, then the deck.
  // Recorded server-side as a Coordinator Deck entry for the audit trail.
  if (!isPending && scope === "coordinator" && profile && !incomplete && !entered) {
    return (
      <Dialog open>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader className="items-center text-center">
            <span className="grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
              <BadgeCheck className="size-5" />
            </span>
            <DialogTitle>পরিচয় নিশ্চিত করুন</DialogTitle>
            <DialogDescription>
              এই পরিচয়ে কোঅর্ডিনেটর ডেক চালু হবে। শুধু আপনার নিজের তথ্য দেখানো হচ্ছে।
            </DialogDescription>
          </DialogHeader>

          <dl className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
            <Row label="নাম" value={profile.name} />
            <Row label="কর্মী আইডি" value={profile.employee_id ?? "—"} />
            <Row label="মোবাইল" value={profile.phone ?? "—"} />
          </dl>

          <Button
            className="h-11 w-full text-base"
            disabled={enter.isPending}
            onClick={() => enter.mutate()}
          >
            {enter.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            ডেস্কে প্রবেশ করুন
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (isPending || !incomplete) return null;

  const validate = () => {
    if (name.trim().length < 2) return "পুরো নাম লিখুন";
    if (employeeId.trim().length < 2) return "কর্মী আইডি লিখুন";
    if (phone.replace(/\D+/g, "").length < 10) return "সঠিক মোবাইল নম্বর লিখুন";
    return null;
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md [&>button]:hidden">
        <DialogHeader className="items-center text-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
            <BadgeCheck className="size-5" />
          </span>
          <DialogTitle>পরিচয় নিশ্চিত করুন</DialogTitle>
          <DialogDescription>
            কোঅর্ডিনেটর ডেক চালু করার আগে আপনার নাম, কর্মী আইডি ও মোবাইল নম্বর নিশ্চিত করতে হবে।
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const problem = validate();
            setError(problem);
            if (!problem) submit.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="coord-name">পুরো নাম</Label>
            <Input
              id="coord-name"
              className="h-11 text-base"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coord-emp">কর্মী আইডি</Label>
            <Input
              id="coord-emp"
              className="h-11 text-base uppercase"
              placeholder="WIN0000"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coord-phone">মোবাইল নম্বর</Label>
            <Input
              id="coord-phone"
              className="h-11 text-base"
              inputMode="tel"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="h-11 w-full text-base" disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            নিশ্চিত করুন
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
