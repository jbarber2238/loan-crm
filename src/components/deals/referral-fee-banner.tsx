"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock } from "lucide-react";
import { markReferralFeePaid } from "@/server/actions/referral-affiliates";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const STYLES = {
  owed: { bar: "border-amber-200 bg-amber-50 text-amber-800", icon: Clock },
  paid: { bar: "border-green-200 bg-green-50 text-green-800", icon: CheckCircle2 },
};

// Only meaningful once a deal has actually closed — before that there's
// nothing owed yet regardless of who referred it. Shown in DealHeader
// alongside ProcessingFeeInvoiceStatus so it's obvious at the top of every
// tab, matching that same "Justin wants this unmissable" convention.
export function ReferralFeeBanner({
  dealId,
  affiliateName,
  paid,
}: {
  dealId: string;
  affiliateName: string;
  paid: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const style = paid ? STYLES.paid : STYLES.owed;
  const Icon = style.icon;

  function handleMarkPaid() {
    startTransition(async () => {
      try {
        await markReferralFeePaid(dealId);
        toast.success("Marked as paid");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't mark this paid");
      }
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm", style.bar)}>
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" />
        Referred by {affiliateName} — {paid ? "referral fee paid" : "referral fee owed"}
      </div>
      {!paid && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-white"
          disabled={isPending}
          onClick={handleMarkPaid}
        >
          {isPending ? "Marking…" : "Mark Paid"}
        </Button>
      )}
    </div>
  );
}
