"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CollapseAllButton({ containerId }: { containerId: string }) {
  const [allOpen, setAllOpen] = useState(true);

  function toggle() {
    const container = document.getElementById(containerId);
    if (!container) return;
    const next = !allOpen;
    container.querySelectorAll("details").forEach((details) => {
      details.open = next;
    });
    setAllOpen(next);
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={toggle}>
      {allOpen ? "Collapse all" : "Expand all"}
    </Button>
  );
}
