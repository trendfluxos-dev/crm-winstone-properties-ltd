import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getAdminToken } from "@/lib/local-session";
import { openWhatsApp } from "@/lib/whatsapp";
import { logWhatsappHandoff } from "@/lib/whatsapp.functions";
import { cn } from "@/lib/utils";

type Props = {
  phone: string | null | undefined;
  leadId?: string | null;
  text?: string | null;
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "secondary" | "ghost" | "outline";
  className?: string;
};

/**
 * Single WhatsApp entry point for the CRM. Always opens WhatsApp OUTSIDE the
 * app (native app on Android, new tab otherwise) — never framed/embedded — and
 * logs the hand-off against the lead timeline.
 */
export function WhatsAppAction({
  phone,
  leadId,
  text,
  label = "হোয়াটসঅ্যাপ",
  size = "sm",
  variant = "secondary",
  className,
}: Props) {
  const handleClick = () => {
    const result = openWhatsApp(phone, text);
    if (!result.ok) {
      toast.error(
        result.reason === "invalid_number"
          ? "নম্বরটি সঠিক নয় — হোয়াটসঅ্যাপ খোলা যায়নি"
          : "ব্রাউজার নতুন উইন্ডো আটকে দিয়েছে — পপ-আপ অনুমোদন করুন",
      );
      return;
    }
    if (!leadId) return;
    void logWhatsappHandoff({
      data: { adminToken: getAdminToken(), leadId, phone: result.msisdn },
    }).catch((error: Error) => {
      console.error("[whatsapp] handoff log failed", error);
    });
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("gap-1", className)}
      onClick={handleClick}
    >
      <MessageCircle className="size-4" /> {label}
    </Button>
  );
}
