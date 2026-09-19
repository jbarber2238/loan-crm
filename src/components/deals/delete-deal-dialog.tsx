"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteDeal } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Deleting is meant to feel hard to do by accident — typing the literal
// word is the actual gate (re-checked server-side too), not just a styled
// "are you sure" button. Nobody who deletes a deal can see or undo it
// afterward themselves; only an admin can, for 30 days, from the
// admin-only deleted-deals view — see deleteDeal's own comment for why.
export function DeleteDealDialog({
  dealId,
  propertyAddress,
  trigger,
  onDeleted,
}: {
  dealId: string;
  propertyAddress: string;
  trigger: ReactNode;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmText("");
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteDeal(dealId, confirmText);
        setOpen(false);
        toast.success("Deal deleted");
        if (onDeleted) onDeleted();
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't delete this deal.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this deal?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">This is not the same as archiving.</p>
            <p>
              Deleting <span className="font-medium">{propertyAddress}</span> removes it from the pipeline and every
              metric immediately. You will not be able to see or undo this yourself. Only an admin can recover it,
              and only within the next 30 days — after that it is permanently gone, along with every note, term
              sheet, and document attached to it.
            </p>
            <p>Only do this for test deals or genuine mistakes that shouldn&apos;t be part of the record at all.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
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
            {pending ? "Deleting…" : "Delete this deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
