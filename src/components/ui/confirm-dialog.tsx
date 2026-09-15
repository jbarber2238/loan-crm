"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// A native window.confirm() is easy to miss (it's small, easy to blast past
// with a reflexive Enter) and — worse — can silently break a delete that's
// triggered from inside a Radix Popover, since the native dialog stealing
// focus confuses the popover's own dismiss handling. A real modal with an
// unmissable red confirm button avoids both problems.
export function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/80"
          >
            No
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Yes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
