import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { unlockAdmin } from "@/lib/crm.functions";
import { setAdminToken, useAdminToken } from "@/lib/local-session";

const PIN_LENGTH = 10;

/** Controlled PIN modal. Once unlocked the token is kept in localStorage. */
export function AdminPinDialog({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [attemptNo, setAttemptNo] = useState(0);
  const unlock = useServerFn(unlockAdmin);

  const attempt = useMutation({
    mutationFn: (value: string) => unlock({ data: { pin: value } }),
    onSuccess: (result) => {
      if (result.ok) {
        setAdminToken(result.token);
        toast.success("Control board unlocked");
        setPin("");
        onOpenChange(false);
        onUnlocked?.();
      } else {
        toast.error("Wrong PIN");
        setPin("");
        setAttemptNo((n) => n + 1);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setPin("");
      setAttemptNo((n) => n + 1);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPin("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary/15 text-primary">
            <Lock className="size-5" />
          </span>
          <DialogTitle>Control board PIN</DialogTitle>
          <DialogDescription>
            Enter the master PIN to unlock lead balancing and manual logs on this device.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <InputOTP
            key={attemptNo}
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={setPin}
            onComplete={(value) => attempt.mutate(value)}
            autoFocus
            disabled={attempt.isPending}
          >
            <InputOTPGroup>
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-8 text-sm sm:size-9" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button
            className="w-full"
            disabled={pin.length !== PIN_LENGTH || attempt.isPending}
            onClick={() => attempt.mutate(pin)}
          >
            {attempt.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LockOpen className="size-4" />
            )}
            Unlock
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wraps an admin-only action. Unlocked: renders children as-is.
 * Locked: clicking the wrapper opens the PIN modal instead.
 */
export function AdminGate({
  children,
  locked,
}: {
  children: ReactNode;
  locked: (openPin: () => void) => ReactNode;
}) {
  const token = useAdminToken();
  const [open, setOpen] = useState(false);

  if (token) return <>{children}</>;
  return (
    <>
      {locked(() => setOpen(true))}
      <AdminPinDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
