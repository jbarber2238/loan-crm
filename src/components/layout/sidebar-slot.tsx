"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders its children into the empty slot the sidebar leaves above Settings (id "sidebar-slot"),
 * so a page can show a small card there (the dashboard's Pro Tip) without the layout knowing
 * about it. Nothing renders if the sidebar isn't on screen (phones keep the slide-out menu).
 */
export function SidebarSlotPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(document.getElementById("sidebar-slot"));
  }, []);
  return target ? createPortal(children, target) : null;
}
