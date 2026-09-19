"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Building2, Users, Handshake, Plug, Phone, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/settings", label: "My Profile", icon: User, exact: true },
    ...(isAdmin
      ? [
          { href: "/settings/company", label: "Company", icon: Building2, exact: true },
          { href: "/settings/team", label: "Team", icon: Users, exact: true },
          { href: "/settings/referrals", label: "Referrals", icon: Handshake, exact: true },
          { href: "/settings/integrations", label: "Integrations", icon: Plug, exact: true },
          { href: "/settings/phone", label: "Phone", icon: Phone, exact: true },
          { href: "/settings/deleted-deals", label: "Deleted Deals", icon: Trash2, exact: true },
        ]
      : []),
  ];

  if (tabs.length === 1) return null;

  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
