"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { checkPricingRequestReply } from "@/server/actions/pricing";

export function PricingAutoCheckReplies({
  dealId,
  pendingRequestIds,
}: {
  dealId: string;
  pendingRequestIds: string[];
}) {
  const router = useRouter();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current || pendingRequestIds.length === 0) return;
    hasRun.current = true;
    Promise.all(
      pendingRequestIds.map((id) => checkPricingRequestReply(dealId, id).catch(() => {}))
    ).then(() => router.refresh());
    // Runs once when this tab mounts — re-checking on every re-render would refetch
    // Gmail on each router.refresh() this effect itself triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
