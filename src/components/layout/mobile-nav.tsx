"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileNavContext {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const Ctx = createContext<MobileNavContext>({ open: false, setOpen: () => undefined });

/** Shared open/closed state for the slide-out menu used below the large-screen breakpoint. */
export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Going somewhere closes the menu, so it never sits over the page you just opened.
  useEffect(() => setOpen(false), [pathname]);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export const useMobileNav = () => useContext(Ctx);

/** The menu button in the top bar. Only shows where the sidebar is hidden (phones and upright iPads). */
export function MobileNavButton() {
  const { setOpen } = useMobileNav();
  return (
    <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
      <Menu className="size-5" />
    </Button>
  );
}
