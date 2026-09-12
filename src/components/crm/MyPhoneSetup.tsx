import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyProfile } from "@/lib/accounts.functions";
import { useMyAccount } from "@/lib/session";

const BD_MOBILE = /^(?:\+?880|0)1[3-9]\d{8}$/;

/**
 * The agent's own SIM number. Calls and WhatsApp are made from this handset, so
 * the number is what ties every synced recording and chat back to the person.
 */
export function MyPhoneSetup() {
  const { account } = useMyAccount();
  const profile = account?.profile ?? null;
  const queryClient = useQueryClient();
  const save = useServerFn(updateMyProfile);

  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [editing, setEditing] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          name: profile?.name ?? "",
          phone: phone.trim(),
          avatarHue: profile?.avatar_hue ?? 200,
        },
      }),
    onSuccess: () => {
      toast.success("আপনার নম্বর সংরক্ষণ হয়েছে");
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["my-account"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!profile) return null;

  const saved = profile.phone?.trim() || "";
  const valid = BD_MOBILE.test(phone.trim());
  const open = editing || !saved;

  return (
    <section className="card-elevated p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">আমার সিম নম্বর</p>
          <p className="text-xs text-muted-foreground">
            {saved
              ? `এই নম্বর থেকে করা কল ও হোয়াটসঅ্যাপ কথা আপনার নামে জমা হয়: ${saved}`
              : "ফোনের যে সিম দিয়ে কল করেন সেই নম্বরটি দিন — তাহলে কল ও হোয়াটসঅ্যাপ আপনার নামে জমা হবে।"}
          </p>
        </div>
        {saved && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            নম্বর বদলান
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="min-w-[12rem] flex-1 space-y-1.5">
            <Label htmlFor="my-sim">মোবাইল নম্বর</Label>
            <Input
              id="my-sim"
              value={phone}
              inputMode="tel"
              placeholder="01XXXXXXXXX"
              onChange={(e) => setPhone(e.target.value)}
            />
            {phone.trim().length > 0 && !valid && (
              <p className="text-xs text-destructive">বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678)।</p>
            )}
          </div>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            সংরক্ষণ
          </Button>
        </div>
      )}
    </section>
  );
}

/** Small line for headings: "আমার নম্বর: 01…". */
export function MyPhoneLine() {
  const { account } = useMyAccount();
  const phone = account?.profile?.phone?.trim();
  if (!phone) return null;
  return <span className="tabular"> · আমার নম্বর {phone}</span>;
}
