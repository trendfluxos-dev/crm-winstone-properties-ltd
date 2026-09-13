import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AboutLegalModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="size-3" />
          About / Legal
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>About Winstone Connect</DialogTitle>
          <DialogDescription>Legal notice and developer attribution</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground">
          <div className="space-y-2 rounded-2xl border border-border bg-surface-2/50 p-4">
            <p className="font-semibold">© 2026 TrendFlux Digital. All Rights Reserved.</p>
            <p className="text-muted-foreground">
              This software, including its design, source code, features, content, workflows, and
              intellectual property, is proprietary and protected by applicable copyright and
              intellectual property laws.
            </p>
          </div>

          <p>
            <span className="font-semibold">Developed &amp; Powered by:</span> Zahid Hasan Emon
          </p>

          <p className="text-muted-foreground">
            Unauthorized copying, distribution, modification, reverse engineering, or commercial use
            without express written permission is strictly prohibited.
          </p>

          <p className="text-xs text-muted-foreground">
            For licensing, support, or partnership inquiries, contact the System Controller or
            Executive HQ administrator.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
