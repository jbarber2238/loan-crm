"use client";

import { useState, type ReactNode } from "react";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { Button } from "@/components/ui/button";

export interface CollapsibleGroup {
  key: string;
  title: string;
  description?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}

/** A set of CollapsibleSections with one Expand all / Collapse all toggle above them. */
export function CollapsibleGroupList({ groups }: { groups: CollapsibleGroup[] }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const allExpanded = groups.every((g) => !closed.has(g.key));

  function setGroupOpen(key: string, open: boolean) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {groups.length > 1 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setClosed(allExpanded ? new Set(groups.map((g) => g.key)) : new Set())}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}
      {groups.map((g) => (
        <CollapsibleSection
          key={g.key}
          title={g.title}
          description={g.description}
          headerExtra={g.headerExtra}
          open={!closed.has(g.key)}
          onOpenChange={(v) => setGroupOpen(g.key, v)}
        >
          {g.children}
        </CollapsibleSection>
      ))}
    </div>
  );
}
