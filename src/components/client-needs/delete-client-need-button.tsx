"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClientNeed } from "@/server/actions/client-need-catalog";
import { Button } from "@/components/ui/button";

export function DeleteClientNeedButton({
  clientNeedId,
  itemName,
  usageCount,
}: {
  clientNeedId: string;
  itemName: string;
  usageCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const confirmMessage =
    usageCount > 0
      ? `Delete "${itemName}"? It's on ${usageCount} product checklist${usageCount === 1 ? "" : "s"} — deleting it removes it from all of them. This can't be undone.`
      : `Delete "${itemName}"? This can't be undone.`;

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    startTransition(async () => {
      await deleteClientNeed(clientNeedId);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={handleClick}
    >
      Delete
    </Button>
  );
}
