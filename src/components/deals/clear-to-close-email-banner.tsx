"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClearToCloseEmailDialog } from "@/components/deals/clear-to-close-email-dialog";
import { clearToCloseEmailPending } from "@/lib/clear-to-close-email";
import type { DealDetail } from "@/server/data/deal-detail";

// Sits at the top of the deal until someone answers the Clear to Close email question, whichever
// way the deal got to that stage (header, board drag, or entering the Clear to Close date).
export function ClearToCloseEmailBanner({ deal }: { deal: DealDetail }) {
  const [open, setOpen] = useState(false);
  if (deal.deletedAt || deal.archivedAt || !clearToCloseEmailPending(deal)) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-600/30 bg-green-600/10 p-3 text-sm">
        <p className="flex min-w-0 items-center gap-2 text-green-900 dark:text-green-200">
          <PartyPopper className="size-4 shrink-0" />
          This deal is Clear to Close. Let {deal.borrowerName.split(" ")[0]} know?
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          Review email
        </Button>
      </div>
      <ClearToCloseEmailDialog dealId={deal.id} open={open} onOpenChange={setOpen} />
    </>
  );
}
