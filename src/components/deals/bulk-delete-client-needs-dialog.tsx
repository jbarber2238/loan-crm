"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteClientNeedsFromDeal } from "@/server/actions/client-needs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const CONFIRM_WORD = "DELETE";

export interface DeletableNeed {
  id: string;
  itemName: string;
  documentCount: number;
}

/**
 * Bulk delete for a multi-selected set of client needs — deliberately harder
 * to trigger by accident than the single-need delete: lists exactly what's
 * about to go, warns that any uploaded documents go with their need, and
 * won't enable the button until the person types DELETE, not just clicks Yes.
 */
export function BulkDeleteClientNeedsDialog({
  dealId,
  needs,
  trigger,
}: {
  dealId: string;
  needs: DeletableNeed[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  const totalDocuments = needs.reduce((sum, n) => sum + n.documentCount, 0);
  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmText("");
  }

  function handleDelete() {
    if (!canDelete) return;
    startTransition(async () => {
      try {
        const deleted = await deleteClientNeedsFromDeal(dealId, needs.map((n) => n.id));
        toast.success(`Deleted ${deleted} client need${deleted === 1 ? "" : "s"}`);
        handleOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't delete these client needs.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Delete {needs.length} client need{needs.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This can&apos;t be undone.
            {totalDocuments > 0 &&
              ` It will also permanently delete ${totalDocuments} uploaded document${totalDocuments === 1 ? "" : "s"} attached to ${totalDocuments === 1 ? "it" : "them"}, except rejected documents, which stay on the Documents tab under Rejected.`}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-destructive/5 p-2 text-sm">
          {needs.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{n.itemName}</span>
              {n.documentCount > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {n.documentCount} doc{n.documentCount === 1 ? "" : "s"}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete-word">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </Label>
          <Input
            id="confirm-delete-word"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!canDelete || pending} onClick={handleDelete}>
            <Trash2 className="size-4" />
            {pending ? "Deleting…" : `Delete ${needs.length}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
