"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveDeal } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Only ever reachable for a Closed or Lost deal — archiveDeal re-checks
// this server-side too, so this dialog doesn't need its own stage gate,
// just the confirmation copy.
export function ArchiveDealDialog({
  dealId,
  propertyAddress,
  trigger,
  onArchived,
}: {
  dealId: string;
  propertyAddress: string;
  trigger: ReactNode;
  onArchived?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      try {
        await archiveDeal(dealId);
        setOpen(false);
        toast.success("Deal archived");
        if (onArchived) onArchived();
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't archive this deal.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this deal?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{propertyAddress}</span> will come off the Pipeline board
            so it stays clean, but nothing is deleted — every note, term sheet, and document stays exactly as it is,
            and the deal still counts in the CRM&apos;s records. You (or anyone else) can restore it back to the
            active pipeline at any time from the Archived Deals view or from the deal itself.
          </p>
          <Button className="w-full" disabled={pending} onClick={handleArchive}>
            {pending ? "Archiving…" : "Archive this deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
