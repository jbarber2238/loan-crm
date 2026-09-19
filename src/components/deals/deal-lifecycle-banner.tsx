"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Archive } from "lucide-react";
import { restoreDeletedDeal, restoreArchivedDeal } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import type { DealDetail } from "@/server/data/deal-detail";

// Opening an archived (or admin-viewed deleted) deal never un-archives or
// restores it on its own — restoring is always this deliberate, separate
// action, never a side effect of just looking at the deal.
export function DealLifecycleBanner({ deal }: { deal: DealDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRestoreDeleted() {
    startTransition(async () => {
      try {
        await restoreDeletedDeal(deal.id);
        toast.success("Deal restored");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restore this deal.");
      }
    });
  }

  function handleRestoreArchived() {
    startTransition(async () => {
      try {
        await restoreArchivedDeal(deal.id);
        toast.success("Deal restored to the active pipeline");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restore this deal.");
      }
    });
  }

  if (deal.deletedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <p className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          This deal was deleted on {deal.deletedAt.toLocaleDateString()}
          {deal.deletedByUser?.name ? ` by ${deal.deletedByUser.name}` : ""}. Only admins can see this page — it will
          be permanently removed 30 days after deletion.
        </p>
        <Button size="sm" variant="destructive" disabled={pending} onClick={handleRestoreDeleted}>
          {pending ? "Restoring…" : "Restore deal"}
        </Button>
      </div>
    );
  }

  if (deal.archivedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          This deal was archived on {deal.archivedAt.toLocaleDateString()}
          {deal.archivedByUser?.name ? ` by ${deal.archivedByUser.name}` : " automatically"}. It's no longer on the
          Pipeline board, but the data is still here.
        </p>
        <Button size="sm" variant="outline" disabled={pending} onClick={handleRestoreArchived}>
          {pending ? "Restoring…" : "Restore to pipeline"}
        </Button>
      </div>
    );
  }

  return null;
}
