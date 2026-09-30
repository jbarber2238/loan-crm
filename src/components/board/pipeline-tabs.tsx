"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Deals is what every signed-in user sees by default; Leads (marketing-site
 * lead magnets) is a narrower, separate list only loan officers and admins
 * work — assistants and processors don't get the tab at all, not even
 * disabled, since it isn't part of their job here.
 */
export function PipelineTabs({ showLeads }: { showLeads: boolean }) {
  const pathname = usePathname();
  if (!showLeads) return null;

  const tabs = [
    { href: "/pipeline", label: "Deals", exact: true },
    { href: "/pipeline/leads", label: "Leads", exact: false },
  ];

  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
