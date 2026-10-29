"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/marketing", label: "Email Builder", exact: true },
  { href: "/marketing/campaigns", label: "Email Campaigns", exact: false },
  { href: "/marketing/email-log", label: "Email Log", exact: false },
  { href: "/marketing/audiences", label: "Audiences", exact: false },
  { href: "/marketing/follow-ups", label: "Follow Up Assistant", exact: false },
];

export function MarketingTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
