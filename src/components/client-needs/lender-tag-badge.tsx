import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The internal "this is <lender>'s form" marker on a client need. Staff-only: never render it on a borrower page or email. */
export function LenderTagBadge({ name, className }: { name: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      title={`Internal only: this need is for ${name}. The borrower never sees this.`}
      className={cn("shrink-0 gap-1 border-primary/40 text-[10px] text-primary", className)}
    >
      <Landmark className="size-3" />
      {name}
    </Badge>
  );
}
