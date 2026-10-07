"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateRejectionNotes } from "@/server/actions/client-need-documents";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RejectedDocument {
  id: string;
  fileName: string;
  rejectionNote: string | null;
}

/**
 * Edit the reason on a need's rejected documents — what the borrower is told
 * to fix. One box per rejected document, since each can have its own reason.
 */
export function EditRejectionReasonDialog({
  dealId,
  needId,
  needName,
  documents,
  open,
  onOpenChange,
}: {
  dealId: string;
  needId: string;
  needName: string;
  documents: RejectedDocument[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const valueFor = (doc: RejectedDocument) => drafts[doc.id] ?? doc.rejectionNote ?? "";

  function handleSave() {
    setError(null);
    const notes = documents.map((d) => ({ documentId: d.id, note: valueFor(d) }));
    if (notes.some((n) => !n.note.trim())) {
      setError("Each rejected document needs a reason.");
      return;
    }
    startTransition(async () => {
      try {
        await updateRejectionNotes(dealId, needId, notes);
        toast.success("Rejection reason updated");
        setDrafts({});
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit rejection reason</DialogTitle>
          <DialogDescription>
            What the borrower is told to fix on &ldquo;{needName}&rdquo;. The change shows in their next reminder and on
            their upload page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {documents.map((doc) => (
            <div key={doc.id} className="space-y-1.5">
              {documents.length > 1 && <Label htmlFor={`reason-${doc.id}`}>{doc.fileName}</Label>}
              <Textarea
                id={`reason-${doc.id}`}
                rows={3}
                value={valueFor(doc)}
                aria-label={documents.length > 1 ? undefined : "Rejection reason"}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [doc.id]: e.target.value }))}
              />
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={pending} onClick={handleSave}>
            {pending ? "Saving…" : "Save reason"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
