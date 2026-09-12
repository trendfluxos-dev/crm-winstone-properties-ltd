import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitMyLead } from "@/lib/agent-desk.functions";
import { useAdminToken } from "@/lib/local-session";

const BD_PHONE = /^(?:\+?880|0)1[3-9]\d{8}$/;

/** An agent adds a lead they found themselves; it lands in their own queue. */
export function NewLeadDialog() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const create = useServerFn(submitMyLead);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [referenceBy, setReferenceBy] = useState("");

  const phoneOk = BD_PHONE.test(phone.trim());
  const valid = name.trim().length > 0 && phoneOk;

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          adminToken,
          name: name.trim(),
          phoneNumber: phone.trim(),
          company: company.trim() || null,
          notes: notes.trim() || null,
          address: address.trim() || null,
          serialNo: serialNo.trim() || null,
          referenceBy: referenceBy.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("লিড যোগ হয়েছে — আপনার তালিকায় দেখা যাবে");
      setName("");
      setPhone("");
      setCompany("");
      setNotes("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <UserPlus className="size-4" /> নতুন লিড
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>নতুন লিড যোগ করুন</DialogTitle>
          <DialogDescription>
            আপনি যে ক্রেতার খোঁজ পেয়েছেন তার তথ্য দিন — লিডটি সরাসরি আপনার তালিকায় যাবে।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">নাম</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="রাকিব হাসান" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">মোবাইল নম্বর</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="01712345678"
            />
            {phone.length > 0 && !phoneOk && (
              <p className="mt-1 text-xs text-destructive">বাংলাদেশি মোবাইল নম্বর দিন</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">প্রতিষ্ঠান (ইচ্ছা হলে)</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">নোট (ইচ্ছা হলে)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="কী নিয়ে কথা হয়েছে"
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            লিড সংরক্ষণ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
