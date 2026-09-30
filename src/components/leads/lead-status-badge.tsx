import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/lead-scoring";
import { LEAD_STATUS_LABELS, LEAD_STATUS_CLASSES } from "@/lib/lead-status-labels";

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        LEAD_STATUS_CLASSES[status],
        className
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
