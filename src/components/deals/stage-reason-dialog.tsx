"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { labelFor, STAGES } from "@/lib/labels";

const PROMPTS: Record<string, string> = {
  on_hold: "Why is this deal going on hold?",
  follow_up: "Why is this deal going to Follow-up?",
  lost: "Why did we lose this deal?",
  disqualified: "Why was this deal disqualified?",
};

const PLACEHOLDERS: Record<string, string> = {
  on_hold: "e.g. waiting on the borrower to sign an updated LOI",
  follow_up: "e.g. borrower has gone quiet, checking back in a few days",
  lost: "e.g. borrower didn't like the terms and went with another lender",
  disqualified: "e.g. credit score came back too low to place with any lender",
};

// One shared dialog for every stage transition that requires a reason
// (On Hold, Follow-up, Lost, Disqualified) — used by both the header
// dropdown and the kanban board's drag-and-drop so the "why" is always
// captured no matter where the change happens.
export function StageReasonDialog({
  stage,
  open,
  onOpenChange,
  onConfirm,
}: {
  stage: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setReason("");
      setError(null);
    }
  }

  function handleConfirm() {
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    onConfirm(reason.trim());
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{PROMPTS[stage] ?? `Move to ${labelFor(STAGES, stage)}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="stage-reason">Reason</Label>
            <Textarea
              id="stage-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder={PLACEHOLDERS[stage] ?? "A quick note…"}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
