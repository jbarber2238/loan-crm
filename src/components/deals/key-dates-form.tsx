"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateDealDates } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isPipelineStage } from "@/lib/deal-pipeline";

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Credit pulled, Clear to Close and Closed dates (plus the Drive link). The
 * Clear to Close and Closed dates work both ways with the pipeline: saving one
 * moves the deal up to that stage, and moving the deal to that stage by hand
 * fills the date in. Closing always asks first.
 */
export function KeyDatesForm({
  dealId,
  dealStage,
  creditPullDate,
  clearToCloseDate,
  closedDate,
  driveLink,
}: {
  dealId: string;
  dealStage: string;
  creditPullDate: Date | null;
  clearToCloseDate: Date | null;
  closedDate: Date | null;
  driveLink: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const savedClosed = toDateInputValue(closedDate);

  function save(formData: FormData) {
    startTransition(async () => {
      try {
        await updateDealDates(dealId, formData);
        toast.success("Saved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const entered = String(formData.get("closedDate") ?? "");
    // A new Closed date on a deal that isn't closed yet would close it.
    const wouldClose = entered !== "" && entered !== savedClosed && isPipelineStage(dealStage) && dealStage !== "closed";
    if (wouldClose) {
      setConfirmOpen(true);
      return;
    }
    save(formData);
  }

  function confirmClose(yes: boolean) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    if (yes) {
      formData.set("confirmClosed", "true");
    } else {
      // No: keep every other change but leave the Closed date as it was.
      formData.set("closedDate", savedClosed);
      const input = formRef.current.elements.namedItem("closedDate");
      if (input instanceof HTMLInputElement) input.value = savedClosed;
    }
    setConfirmOpen(false);
    save(formData);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="creditPullDate">Credit pulled</Label>
            <Input id="creditPullDate" name="creditPullDate" type="date" defaultValue={toDateInputValue(creditPullDate)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clearToCloseDate">Clear to Close</Label>
            <Input
              id="clearToCloseDate"
              name="clearToCloseDate"
              type="date"
              defaultValue={toDateInputValue(clearToCloseDate)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closedDate">Closed</Label>
            <Input id="closedDate" name="closedDate" type="date" defaultValue={savedClosed} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label htmlFor="driveLink">Google Drive link</Label>
            <Input id="driveLink" name="driveLink" defaultValue={driveLink ?? ""} />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Saving a Clear to Close or Closed date moves the deal up to that stage. Moving the deal to either stage
              fills in its date.
            </p>
          </div>
        </form>

        <Dialog open={confirmOpen} onOpenChange={(open) => !open && confirmClose(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Do you want to officially document this as closed?</DialogTitle>
              <DialogDescription>
                This moves the deal to Closed and counts it in loans closed and revenue.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => confirmClose(false)}>
                No
              </Button>
              <Button type="button" onClick={() => confirmClose(true)}>
                Yes, mark as closed
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
