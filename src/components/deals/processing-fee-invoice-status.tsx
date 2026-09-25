"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { resendProcessingFeeInvoice, markProcessingFeePaidManually } from "@/server/actions/term-sheets";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const STYLES: Record<string, { bar: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  paid: { bar: "border-green-200 bg-green-50 text-green-800", icon: CheckCircle2, label: "Paid" },
  open: { bar: "border-amber-200 bg-amber-50 text-amber-800", icon: Clock, label: "Sent — awaiting payment" },
  payment_failed: { bar: "border-red-200 bg-red-50 text-red-800", icon: AlertCircle, label: "Payment failed" },
};

// Rendered directly in DealHeader (not buried inside AcceptedTermsHeader) so
// it shows prominently at the top of every tab on the deal, not just as a
// small line among the fee tiles — Justin specifically asked for this to be
// obvious wherever he's looking at the loan.
export function ProcessingFeeInvoiceStatus({
  dealId,
  amount,
  status,
  url,
}: {
  dealId: string;
  amount: number;
  status: string;
  url: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [resending, startResend] = useTransition();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [marking, startMark] = useTransition();

  const style = STYLES[status] ?? STYLES.open;
  const Icon = style.icon;
  const money = `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const canAct = status !== "paid";

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleResend() {
    startResend(async () => {
      try {
        await resendProcessingFeeInvoice(dealId);
        toast.success("Invoice email re-sent");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't resend the invoice");
      }
    });
  }

  function handleMarkPaid() {
    setConfirmOpen(false);
    startMark(async () => {
      try {
        await markProcessingFeePaidManually(dealId);
        toast.success("Marked paid");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't mark this paid");
      }
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm", style.bar)}>
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" />
        Processing Fee Invoice ({money}) — {style.label}
      </div>
      <div className="flex items-center gap-2">
        {url && (
          <Button type="button" variant="outline" size="sm" className="bg-white" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy invoice link"}
          </Button>
        )}
        {canAct && (
          <Button type="button" variant="outline" size="sm" className="bg-white" disabled={resending} onClick={handleResend}>
            {resending ? "Resending…" : "Resend invoice"}
          </Button>
        )}
        {canAct && (
          <Button type="button" variant="outline" size="sm" className="bg-white" disabled={marking} onClick={() => setConfirmOpen(true)}>
            {marking ? "Marking…" : "Mark paid"}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Mark this invoice paid?"
        message="Are you certain this has been paid and you have confirmed the payment went through in Stripe? Marking it paid moves the deal to Application and notifies the borrower and the assigned processor. Any other unpaid invoice still tracked on this deal will be voided."
        onConfirm={handleMarkPaid}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
