"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteTransactionalLoan } from "@/server/actions/transactional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DELETED_DEAL_PURGE_AFTER_DAYS } from "@/lib/deal-pipeline";

// Same gate as deleting a deal: typing the word is the real confirmation
// (re-checked on the server). Only an admin can recover it afterward.
export function DeleteTransactionalDialog({
  loanId,
  propertyAddress,
  trigger,
  onDeleted,
}: {
  loanId: string;
  propertyAddress: string;
  trigger: ReactNode;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteTransactionalLoan(loanId, confirmText);
        setOpen(false);
        toast.success("Request deleted");
        if (onDeleted) onDeleted();
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't delete this request.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this request?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">This is not the same as archiving.</p>
            <p>
              Deleting <span className="font-medium">{propertyAddress}</span> removes it from the pipeline and its
              numbers immediately. You will not be able to see or undo this yourself. Only an admin can recover it, and
              only within the next {DELETED_DEAL_PURGE_AFTER_DAYS} days — after that it is permanently gone.
            </p>
            <p>Only do this for test requests or genuine mistakes that shouldn&apos;t be part of the record at all.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delete-transactional-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="delete-transactional-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button
            variant="destructive"
            className="w-full"
            disabled={confirmText.trim() !== "DELETE" || pending}
            onClick={handleDelete}
          >
            {pending ? "Deleting…" : "Delete this request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
