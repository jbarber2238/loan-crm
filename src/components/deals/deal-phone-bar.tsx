"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Layers, FileSignature, Tags, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS: { path: string; label: string; icon: LucideIcon; exact: boolean }[] = [
  { path: "", label: "Overview", icon: FileText, exact: true },
  { path: "/pricing", label: "Pricing", icon: Tags, exact: false },
  { path: "/term-sheets", label: "Terms", icon: FileSignature, exact: false },
  { path: "/loan-center", label: "Loan Center", icon: Layers, exact: false },
];

/**
 * Phone and iPad bottom bar for a deal's own pages (Overview, Pricing, Terms, Loan Center), the
 * counterpart of the Pipeline's main bar. Inside the Loan Center the bar is that page's own section
 * switcher instead, so this one steps aside there; Overview and Pipeline stay one tap away in the
 * side menu. Always pinned to the bottom, whatever the page does when scrolling.
 */
export function DealPhoneBar({ dealId }: { dealId: string }) {
  const pathname = usePathname();
  const base = `/deals/${dealId}`;
  const inLoanCenter = pathname.startsWith(`${base}/loan-center`);

  // Lets the floating chat button sit above the bar instead of behind it.
  useEffect(() => {
    if (inLoanCenter) return;
    document.documentElement.style.setProperty("--bottom-bar", "4rem");
    return () => {
      document.documentElement.style.removeProperty("--bottom-bar");
    };
  }, [inLoanCenter]);

  if (inLoanCenter) return null;

  return (
    <>
      <div aria-hidden="true" className="h-20 lg:hidden" />
      <nav
        aria-label="This loan"
        className="fixed inset-x-0 bottom-0 z-30 grid translate-z-0 grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {ITEMS.map((item) => {
          const href = `${base}${item.path}`;
          const active = item.exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={item.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("size-6", active && "stroke-[2.25]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
