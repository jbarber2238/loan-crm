"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGES } from "@/lib/labels";
import { STAGES_REQUIRING_REASON, STAGES_REQUIRING_CONFIRMATION } from "@/lib/deal-pipeline";
import { updateDealStage } from "@/server/actions/deals";
import { StageReasonDialog } from "@/components/deals/stage-reason-dialog";
import { ClosedConfirmDialog } from "@/components/deals/closed-confirm-dialog";

export function StageSelect({ dealId, stage }: { dealId: string; stage: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [pendingClosedStage, setPendingClosedStage] = useState<string | null>(null);

  function commit(newStage: string, reason?: string, confirmed?: boolean) {
    startTransition(async () => {
      await updateDealStage(dealId, newStage, reason, confirmed);
      router.refresh();
    });
  }

  return (
    <>
      <Select
        value={stage}
        disabled={isPending}
        onValueChange={(value) => {
          if (STAGES_REQUIRING_REASON.has(value)) {
            setPendingStage(value);
          } else if (STAGES_REQUIRING_CONFIRMATION.has(value)) {
            setPendingClosedStage(value);
          } else {
            commit(value);
          }
        }}
      >
        <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STAGES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pendingStage && (
        <StageReasonDialog
          stage={pendingStage}
          open={!!pendingStage}
          onOpenChange={(open) => {
            if (!open) setPendingStage(null);
          }}
          onConfirm={(reason) => {
            commit(pendingStage, reason);
            setPendingStage(null);
          }}
        />
      )}
      {pendingClosedStage && (
        <ClosedConfirmDialog
          open={!!pendingClosedStage}
          onOpenChange={(open) => {
            if (!open) setPendingClosedStage(null);
          }}
          onConfirm={() => {
            commit(pendingClosedStage, undefined, true);
            setPendingClosedStage(null);
          }}
        />
      )}
    </>
  );
}
