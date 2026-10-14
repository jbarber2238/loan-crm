"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreArchivedTransactionalLoan, restoreDeletedTransactionalLoan } from "@/server/actions/transactional";
import { Button } from "@/components/ui/button";

export function RestoreTransactionalButton({
  loanId,
  kind,
  variant = "outline",
}: {
  loanId: string;
  kind: "archived" | "deleted";
  variant?: "outline" | "destructive";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        if (kind === "archived") await restoreArchivedTransactionalLoan(loanId);
        else await restoreDeletedTransactionalLoan(loanId);
        toast.success(kind === "archived" ? "Request restored to the board" : "Request restored");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restore this request.");
      }
    });
  }

  return (
    <Button size="sm" variant={variant} disabled={pending} onClick={handleClick}>
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
