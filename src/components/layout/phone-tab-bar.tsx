"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Columns3, Inbox, Landmark, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dark appearance on a phone or upright iPad: the design board's bottom bar for the app's main
 * places, with a New Deal button in the middle. The Loan Center keeps its own bar (and deal pages
 * are reached from the pipeline), so this one stays out of the way there.
 */
export function PhoneTabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/deals/") && pathname !== "/deals/new";

  // Lets the floating chat button sit above the bar instead of behind it.
  useEffect(() => {
    if (hidden) return;
    document.documentElement.style.setProperty("--bottom-bar", "5rem");
    return () => {
      document.documentElement.style.removeProperty("--bottom-bar");
    };
  }, [hidden]);

  if (hidden) return null;

  const items = [
    { href: "/pipeline", label: "Pipeline", icon: Columns3 },
    isAdmin
      ? { href: "/dashboard", label: "Dashboard", icon: BarChart3 }
      : { href: "/client-needs", label: "Needs", icon: ClipboardList },
    null,
    { href: "/lenders", label: "Lenders", icon: Landmark },
    { href: "/inbox", label: "Inbox", icon: Inbox },
  ];

  return (
    <nav
      aria-label="Main"
      className="theme-dark-only fixed inset-x-0 bottom-0 z-30 !grid grid-cols-5 items-end border-t border-[rgba(246,246,246,.08)] bg-[#0b0c0d] pb-[env(safe-area-inset-bottom)] lg:!hidden"
    >
      {items.map((item) =>
        item === null ? (
          <Link
            key="new"
            href="/deals/new"
            aria-label="New deal"
            className="mx-auto -mt-4 mb-2 grid size-14 place-items-center rounded-full bg-[#fa5f05] text-[#0b0c0d] shadow-[0_8px_24px_rgba(250,95,5,.35)]"
          >
            <Plus className="size-7" />
          </Link>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
              pathname.startsWith(item.href) ? "text-[#fa5f05]" : "text-[rgba(246,246,246,.72)]"
            )}
          >
            <item.icon className="size-[22px]" />
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}
