"use client";

import { createContext, useContext, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const OpenContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

/**
 * Hide-on-phones-until-expanded marker for the deal header's detail pieces.
 * Phones and iPads (below lg) start collapsed to just the address and
 * borrower name so the activity being worked on gets the screen; laptops
 * always show everything.
 */
export const HEADER_DETAIL = "max-lg:group-data-[open=false]/hdr:hidden";

export function DealHeaderShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <OpenContext.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      <div data-open={open} className="group/hdr flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
        {children}
      </div>
    </OpenContext.Provider>
  );
}

export function DealHeaderToggle() {
  const ctx = useContext(OpenContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.toggle}
      aria-expanded={ctx.open}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted lg:hidden"
    >
      {ctx.open ? "Hide loan details" : "Loan details"}
      <ChevronDown className={cn("size-3.5 transition-transform", ctx.open && "rotate-180")} />
    </button>
  );
}
