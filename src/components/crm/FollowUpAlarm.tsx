import { BellRing, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { askFollowUpNotifications, useFollowUpReminders } from "@/hooks/use-followup-reminders";

/**
 * Turns the agent's phone into the follow-up alarm: a notification lands 30
 * minutes before every scheduled follow-up while the desk is open (including the
 * web app installed on the home screen). Shows nothing once permission is on and
 * there is nothing to warn about.
 */
export function FollowUpAlarm() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  useFollowUpReminders(permission === "granted");

  if (permission === "granted" || permission === "unsupported") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      {permission === "denied" ? (
        <BellOff className="size-5 shrink-0 text-muted-foreground" />
      ) : (
        <BellRing className="size-5 shrink-0 text-primary" />
      )}
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {permission === "denied"
          ? "ফোনের সেটিংসে এই সাইটের নোটিফিকেশন বন্ধ আছে — চালু করলে ফলো-আপের ৩০ মিনিট আগে ফোনে অ্যালার্ম আসবে।"
          : "ফলো-আপের ৩০ মিনিট আগে ফোনে অ্যালার্ম পেতে নোটিফিকেশন চালু করুন।"}
      </p>
      {permission !== "denied" ? (
        <Button
          size="sm"
          onClick={async () => {
            const next = await askFollowUpNotifications();
            setPermission(next);
            if (next === "granted") toast.success("ফলো-আপ অ্যালার্ম চালু হয়েছে");
            else toast.error("নোটিফিকেশন অনুমতি দেওয়া হয়নি");
          }}
        >
          <BellRing className="size-4" /> চালু করুন
        </Button>
      ) : null}
    </div>
  );
}
