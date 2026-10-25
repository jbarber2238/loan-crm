"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Building2, Users, Handshake, Plug, Phone, Mail, Trash2, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Grouped by what you're doing, not by when each tab was added. The routes
// themselves are unchanged, so every existing link and bookmark still works.
export const SETTINGS_GROUPS: NavGroup[] = [
  { title: "Account", items: [{ href: "/settings", label: "My Profile", icon: User }] },
  {
    title: "Company",
    items: [
      { href: "/settings/company", label: "Company", icon: Building2, adminOnly: true },
      { href: "/settings/licensing", label: "Licensing", icon: ShieldCheck, adminOnly: true },
      { href: "/settings/team", label: "Team", icon: Users, adminOnly: true },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/settings/phone", label: "Phone", icon: Phone, adminOnly: true },
      { href: "/settings/email-templates", label: "Email Templates", icon: Mail, adminOnly: true },
    ],
  },
  { title: "Programs", items: [{ href: "/settings/referrals", label: "Referrals", icon: Handshake, adminOnly: true }] },
  {
    title: "System",
    items: [
      { href: "/settings/integrations", label: "Integrations", icon: Plug, adminOnly: true },
      { href: "/settings/deleted-deals", label: "Deleted Deals", icon: Trash2, adminOnly: true },
    ],
  },
];

/** The groups a person can see: everyone gets My Profile, admins get the rest. */
export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) })).filter((g) => g.items.length > 0);
}

export function SettingsNav({ isAdmin, pathnameOverride }: { isAdmin: boolean; pathnameOverride?: string }) {
  const livePathname = usePathname();
  const pathname = pathnameOverride ?? livePathname;
  const groups = visibleGroups(isAdmin);
  if (groups.flatMap((g) => g.items).length <= 1) return null;

  const link = (item: NavItem, mobile: boolean) => {
    const active = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        data-snav={mobile ? "chip" : "item"}
        className={cn(
          "flex items-center gap-2 text-sm transition-colors",
          mobile ? "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5" : "rounded-md px-3 py-1.5",
          active
            ? mobile
              ? "border-foreground bg-foreground font-medium text-background"
              : "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <Icon className="size-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      {/* Phones: one scrollable row, in the same order as the groups. */}
      <nav aria-label="Settings" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 md:hidden">
        {groups.flatMap((g) => g.items).map((i) => link(i, true))}
      </nav>
      {/* Wider screens: a left menu with a heading per group. */}
      <nav aria-label="Settings" data-snav-menu className="hidden w-52 shrink-0 space-y-5 md:block">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1">
            <p data-snav-group className="px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g.title}</p>
            {g.items.map((i) => link(i, false))}
          </div>
        ))}
      </nav>
    </>
  );
}
