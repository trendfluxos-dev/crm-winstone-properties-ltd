import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "অ্যাপ ইনস্টল করুন" — puts the CRM on the phone's home screen so it opens
 * full-screen with its own icon. Chrome/Android hands us an install prompt; on
 * iOS Safari there is none, so we explain the Share → Add to Home Screen step.
 */
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setStandalone(installed);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setStandalone(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        aria-label="ফোনে অ্যাপ ইনস্টল করুন"
        className="h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
            return;
          }
          setHint(true);
        }}
      >
        <Download className="size-3.5" />
        <span className="hidden sm:inline">অ্যাপ ইনস্টল</span>
        <span className="sm:hidden">ইনস্টল</span>
      </Button>
      {hint ? (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Share className="size-3" /> ব্রাউজারের মেনু → “Add to Home screen”
        </p>
      ) : null}
    </>
  );
}
