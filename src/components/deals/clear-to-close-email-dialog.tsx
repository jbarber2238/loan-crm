"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import {
  previewClearToCloseEmail,
  sendClearToCloseEmail,
  declineClearToCloseEmail,
  type ClearToCloseEmailPreview,
} from "@/server/actions/clear-to-close-email";
import { isActionError } from "@/lib/action-result";
import { CTC_ALREADY_ANSWERED, CTC_NOT_WAITING } from "@/lib/clear-to-close-email";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Shows the exact email, then asks yes or no. Closing the dialog any other way leaves the
// question open; the deal page keeps offering it until someone answers.
export function ClearToCloseEmailDialog({
  dealId,
  open,
  onOpenChange,
  quiet = false,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Right after a stage move: if the question isn't open (already answered), close without a word. */
  quiet?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so every opening loads a fresh preview. */}
        <DialogBody dealId={dealId} onOpenChange={onOpenChange} quiet={quiet} />
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({
  dealId,
  onOpenChange,
  quiet,
}: {
  dealId: string;
  onOpenChange: (open: boolean) => void;
  quiet: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<ClearToCloseEmailPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Callers pass a fresh function each render; keep it out of the effect's dependencies.
  const closeRef = useRef(onOpenChange);
  useEffect(() => {
    closeRef.current = onOpenChange;
  });

  useEffect(() => {
    let cancelled = false;
    previewClearToCloseEmail(dealId)
      .then((result) => {
        if (cancelled) return;
        if (isActionError(result)) {
          if (quiet && (result.error === CTC_ALREADY_ANSWERED || result.error === CTC_NOT_WAITING)) closeRef.current(false);
          else setLoadError(result.error);
        } else setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load the email. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, quiet]);

  function answer(send: boolean) {
    startTransition(async () => {
      const result = send ? await sendClearToCloseEmail(dealId) : await declineClearToCloseEmail(dealId);
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(send ? "Clear to Close email sent to the borrower" : "Okay, no email will be sent");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send the Clear to Close email to the borrower?</DialogTitle>
        <DialogDescription>This is exactly what they&apos;ll get. Nothing is sent unless you choose yes.</DialogDescription>
      </DialogHeader>

      {loadError && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{loadError}</p>}
      {!loadError && !preview && <p className="py-8 text-center text-sm text-muted-foreground">Loading the email…</p>}

      {preview && (
        <div className="space-y-3">
          <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">To</dt>
            <dd className="min-w-0 truncate">{preview.to}</dd>
            <dt className="text-muted-foreground">From</dt>
            <dd className="min-w-0 truncate">
              {preview.fromName} &lt;{preview.fromEmail}&gt;
            </dd>
            <dt className="text-muted-foreground">Subject</dt>
            <dd className="min-w-0 font-medium">{preview.subject}</dd>
          </dl>
          <div
            data-email-preview
            className="max-h-[50vh] overflow-y-auto rounded-lg border bg-white p-4 text-[#1f2937]"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={() => answer(false)}>
          No, don&apos;t send
        </Button>
        <Button type="button" disabled={pending || !preview} onClick={() => answer(true)}>
          <Send className="size-4" />
          {pending ? "Working…" : "Yes, send to borrower"}
        </Button>
      </div>
    </>
  );
}
