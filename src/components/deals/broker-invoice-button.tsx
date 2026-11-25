"use client";

import { useState } from "react";
import { FileText, Loader2, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brokerInvoiceFileName, type BrokerInvoiceBlocker } from "@/lib/broker-invoice";

const BLOCKERS = new Set<BrokerInvoiceBlocker>(["no_lender", "no_loan_amount", "rate_not_locked"]);

/**
 * One click downloads the deal's broker invoice. If the rate isn't locked yet (or the deal has no loan amount to
 * bill), the click opens a pop-up explaining why instead. The server makes the same check, so a page that was
 * loaded before the rate was unlocked still gets the pop-up, never a wrong invoice.
 */
export function BrokerInvoiceButton({
  dealId,
  propertyAddress,
  blocker: knownBlocker,
  loanOfficerName,
  viewerIsLoanOfficer,
}: {
  dealId: string;
  propertyAddress: string;
  blocker: BrokerInvoiceBlocker | null;
  loanOfficerName: string | null;
  /** The loan officer (or an admin) is told to lock the rate; everyone else is told to check with the loan officer. */
  viewerIsLoanOfficer: boolean;
}) {
  const [busy, setBusy] = useState(false);
  // The reason stays set while the pop-up closes, so its wording doesn't change mid-animation.
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<BrokerInvoiceBlocker>("rate_not_locked");

  function explain(reason: BrokerInvoiceBlocker) {
    setShown(reason);
    setOpen(true);
  }

  async function handleClick() {
    if (knownBlocker) {
      explain(knownBlocker);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/deals/${dealId}/broker-invoice`, { cache: "no-store" });
      if (response.status === 409) {
        const body: unknown = await response.json().catch(() => null);
        const code = body && typeof body === "object" && "blocker" in body ? (body as { blocker: unknown }).blocker : null;
        explain(BLOCKERS.has(code as BrokerInvoiceBlocker) ? (code as BrokerInvoiceBlocker) : "rate_not_locked");
        return;
      }
      if (!response.ok) throw new Error(`Invoice request failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = brokerInvoiceFileName(propertyAddress);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Broker invoice downloaded");
    } catch {
      toast.error("Couldn't create the invoice. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const officer = loanOfficerName?.trim() || "the loan officer";

  return (
    <>
      <Button type="button" variant="outline" onClick={handleClick} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
        Broker Invoice
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {shown === "rate_not_locked" && <LockOpen className="size-4 text-orange-500" />}
              {shown === "rate_not_locked" ? "The rate isn't locked yet" : "This invoice isn't ready yet"}
            </DialogTitle>
            <DialogDescription>
              {shown === "rate_not_locked"
                ? "The broker invoice can't be downloaded because the rate has not officially been locked."
                : shown === "no_loan_amount"
                  ? "The broker invoice can't be downloaded because this loan has no approved loan amount yet."
                  : "The broker invoice can't be downloaded because this loan has no lender yet."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {shown === "rate_not_locked" ? (
              viewerIsLoanOfficer ? (
                <>
                  Once the lender confirms the lock, click <span className="font-medium">Lock rate</span> under Accepted
                  terms, then download the invoice.
                </>
              ) : (
                <>
                  Please check with <span className="font-medium">{officer}</span> before an invoice goes out.
                  Once the rate is locked, this button will download it.
                </>
              )
            ) : shown === "no_loan_amount" ? (
              <>The fee is a percentage of the loan amount. Add the loan amount under Accepted terms first.</>
            ) : (
              <>Accept a term sheet for this loan first.</>
            )}
          </p>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
