"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { MannaLogo } from "@/components/marketing/manna-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

// The loan officer every public page's "Apply" link routes to — Justin
// himself, the only loan officer at the company today.
const LOAN_OFFICER_ID = "70b5d857-8139-48d2-bb92-9b7fd7862a3b";
const APPLY_HREF = `/intake/${LOAN_OFFICER_ID}`;

/**
 * Shared across every public marketing/intake page (mirrors SiteFooter) so
 * the header never drifts between pages. "Programs" always links back to
 * the homepage's anchor rather than a bare `#programs`, since this header
 * now renders on pages other than the homepage too.
 */
export function SiteHeader() {
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setResourcesOpen(true);
  }

  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setResourcesOpen(false), 150);
  }

  return (
    <header className="border-b" style={{ backgroundColor: OFF_WHITE, borderColor: "rgba(20,61,74,0.12)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/">
          <MannaLogo className="h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/#programs" className="hidden text-sm font-medium tracking-wide sm:inline" style={{ color: BASALT }}>
            Programs
          </Link>
          <div onMouseEnter={openNow} onMouseLeave={closeSoon}>
            <DropdownMenu open={resourcesOpen} onOpenChange={setResourcesOpen}>
              <DropdownMenuTrigger asChild>
                <Link href="/resources" className="hidden text-sm font-medium tracking-wide outline-none sm:inline" style={{ color: BASALT }}>
                  Resources
                </Link>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onMouseEnter={openNow} onMouseLeave={closeSoon}>
                <DropdownMenuItem asChild>
                  <Link href="/resources/dscr-calculator">DSCR Calculator</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/resources/hard-money-calculator">Hard Money Leverage Calculator</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Link
            href={APPLY_HREF}
            className="rounded-sm px-5 py-2.5 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: TEAL }}
          >
            Apply Now
          </Link>
        </nav>
      </div>
    </header>
  );
}
