"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import { restoreArchivedDeal } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchiveDealDialog } from "@/components/deals/archive-deal-dialog";
import { DeleteDealDialog } from "@/components/deals/delete-deal-dialog";
import { ARCHIVABLE_STAGES } from "@/lib/deal-pipeline";

// The deal-detail equivalent of the Pipeline card's kebab menu — same
// actions, same dialogs, just reachable from inside the deal itself too.
export function DealActionsMenu({
  dealId,
  stage,
  propertyAddress,
  isArchived,
}: {
  dealId: string;
  stage: string;
  propertyAddress: string;
  isArchived: boolean;
}) {
  const router = useRouter();

  async function handleUnarchive() {
    try {
      await restoreArchivedDeal(dealId);
      toast.success("Deal restored to the active pipeline");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore this deal.");
    }
  }

  function handleDeleted() {
    router.push("/pipeline");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isArchived ? (
          <DropdownMenuItem onSelect={handleUnarchive}>Restore to pipeline</DropdownMenuItem>
        ) : (
          ARCHIVABLE_STAGES.has(stage) && (
            <ArchiveDealDialog
              dealId={dealId}
              propertyAddress={propertyAddress}
              trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Archive</DropdownMenuItem>}
            />
          )
        )}
        <DeleteDealDialog
          dealId={dealId}
          propertyAddress={propertyAddress}
          onDeleted={handleDeleted}
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
              Delete
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
