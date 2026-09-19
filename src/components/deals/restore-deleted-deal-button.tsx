"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreDeletedDeal } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";

export function RestoreDeletedDealButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await restoreDeletedDeal(dealId);
        toast.success("Deal restored");
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
