"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreArchivedDeal } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";

export function RestoreArchivedDealButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await restoreArchivedDeal(dealId);
        toast.success("Deal restored to the active pipeline");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restore this deal.");
      }
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
