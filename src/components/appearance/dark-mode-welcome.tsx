"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { finishDarkModeWelcome } from "@/server/actions/appearance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DarkPreview } from "@/components/appearance/theme-previews";

/**
 * One-time offer, shown the next time a user opens the CRM. However it's closed, it's recorded
 * as seen so it never comes back; only "Turn on dark mode" changes the theme.
 */
export function DarkModeWelcome({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();

  function finish(turnOn: boolean) {
    setOpen(false);
    if (turnOn) document.documentElement.classList.add("dark");
    startTransition(async () => {
      await finishDarkModeWelcome(turnOn);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent className="max-w-[min(44rem,calc(100vw-2rem))] gap-4 p-6 sm:max-w-2xl">
        <DialogTitle className="text-2xl font-bold">Welcome, {firstName}</DialogTitle>
        <DialogDescription className="text-base text-foreground/80">
          You can now select an alternative dark mode view of the CRM. Would you like to try it?
        </DialogDescription>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Preview: dark mode on</p>
          <DarkPreview className="h-44 w-full" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" size="lg" className="min-h-11 rounded-full px-6" onClick={() => finish(true)}>
            <Check className="size-4" /> Turn on dark mode
          </Button>
          <Button type="button" size="lg" variant="outline" className="min-h-11 rounded-full px-6" onClick={() => finish(false)}>
            Maybe later
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Not for you? You can switch it off anytime in <strong className="text-foreground">Settings &gt; My Profile &gt; Appearance</strong>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
