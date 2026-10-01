"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markClientNeedUnused } from "@/server/actions/client-needs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Same shape as ArchiveDealDialog — a plain Cancel/Confirm, no typed
// confirmation needed since this isn't destructive (the document stays on
// the deal, just moves to the Documents tab).
export function MarkUnusedDialog({
  dealId,
  needId,
  itemName,
  trigger,
}: {
  dealId: string;
  needId: string;
  itemName: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await markClientNeedUnused(dealId, needId);
        setOpen(false);
        toast.success("Marked unused");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't mark this need unused.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark &quot;{itemName}&quot; unused?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirms this need turned out not to be required. It&apos;ll come off the Client Needs list, and its
            uploaded document(s) will move to the Unused section of the Documents tab — nothing is deleted.
          </p>
          <Button className="w-full" disabled={pending} onClick={handleConfirm}>
            {pending ? "Marking unused…" : "Mark Unused"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
