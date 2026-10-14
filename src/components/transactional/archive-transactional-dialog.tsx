"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveTransactionalLoan } from "@/server/actions/transactional";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Only reachable for a Closed or Lost request; archiveTransactionalLoan
// re-checks that on the server.
export function ArchiveTransactionalDialog({
  loanId,
  propertyAddress,
  trigger,
  onArchived,
}: {
  loanId: string;
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
        await archiveTransactionalLoan(loanId);
        setOpen(false);
        toast.success("Request archived");
        if (onArchived) onArchived();
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't archive this request.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this request?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{propertyAddress}</span> will come off the Transactional board
            so it stays clean, but nothing is deleted — everything stays exactly as it is. Anyone can restore it from
            Archived Requests or from the request itself.
          </p>
          <Button className="w-full" disabled={pending} onClick={handleArchive}>
            {pending ? "Archiving…" : "Archive this request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
