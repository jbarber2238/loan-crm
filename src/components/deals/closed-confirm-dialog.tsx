"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Deliberately no text field — closing is a yes/no fact, not something
// that needs a note. The bold copy and the literal button label are the
// point: this is the one stage change that's expensive to get wrong by
// accident (it counts as revenue and a win in every dashboard metric).
export function ClosedConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this loan as Closed?</DialogTitle>
          <DialogDescription>
            This means the loan has actually closed with title — funded and recorded. It will count as a closed
            loan in every dashboard metric (revenue, loan officer performance, lender performance). This isn&apos;t
            reversible from here without going back into the deal and moving it manually.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Yes, this loan is closed
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
