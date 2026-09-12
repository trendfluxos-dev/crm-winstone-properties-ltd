import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PhoneIncoming } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { logIncomingCallback } from "@/lib/call-reports.functions";
import { useAdminToken } from "@/lib/local-session";

/**
 * "ক্রেতা ফিরতি কল করেছে" — logs an incoming callback on this lead and opens
 * the mandatory post-call report (same gate as outgoing calls).
 */
export function CallbackLogButton({
  leadId,
  className,
  label = "কলব্যাক",
}: {
  leadId: string;
  className?: string;
  label?: string;
}) {
  const adminToken = useAdminToken();
  const run = useServerFn(logIncomingCallback);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => run({ data: { adminToken, leadId, durationSeconds: 0 } }),
    onSuccess: () => {
      toast.success("কলব্যাক জমা হয়েছে — এখন রিপোর্টটি পূরণ করুন");
      void queryClient.invalidateQueries({ queryKey: ["pending-call-report"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className={className}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      title="ক্রেতা ফিরতি কল করলে এখানে চাপ দিন"
    >
      {mutation.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <PhoneIncoming className="size-4" />
      )}
      {label}
    </Button>
  );
}
