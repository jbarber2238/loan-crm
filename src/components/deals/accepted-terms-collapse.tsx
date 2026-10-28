"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The accepted-terms tiles live in the deal layout, so they render on every tab.
 * Overview always shows them open; the Loan Center is a working screen that needs
 * the room, so there they start collapsed behind a one-line toggle. The expanded
 * state is keyed to the path, so each visit to the Loan Center starts collapsed.
 */
export function AcceptedTermsCollapse({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const collapsible = pathname.includes("/loan-center");
  const [expandedAt, setExpandedAt] = useState<string | null>(null);
  const expanded = expandedAt === pathname;

  if (!collapsible) return <>{children}</>;

  return (
    <div className="border-t pt-2">
      <button
        type="button"
        onClick={() => setExpandedAt(expanded ? null : pathname)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm hover:bg-muted/50"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium">Accepted terms</span>
          <span className="truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {/* The tiles bring their own top rule; the toggle row above already has one. */}
      {expanded && <div className="[&>div]:border-t-0 [&>div]:pt-1">{children}</div>}
    </div>
  );
}
