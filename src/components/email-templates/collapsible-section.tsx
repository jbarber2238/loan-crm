"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  headerExtra,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  /** Pass both to control open/closed externally (e.g. a page-level Collapse/Expand All) — omit for normal self-managed behavior. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
            {description && (
              <p className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </CollapsibleTrigger>
        {headerExtra}
      </div>
      <CollapsibleContent className="space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
