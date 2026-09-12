import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { initiateTwilioCall } from "@/lib/twilio.functions";

export function TwilioCallButton({
  leadId,
  disabled,
  className,
  variant = "outline",
}: {
  leadId: string;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const queryClient = useQueryClient();
  const call = useServerFn(initiateTwilioCall);
  const mutation = useMutation({
    mutationFn: () => call({ data: { leadId } }),
    onSuccess: (result) => {
      toast.success(`টুইলিও কল শুরু হয়েছে — স্ট্যাটাস: ${result.status}`);
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["call-ops"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
      টুইলিও কল
    </Button>
  );
}
