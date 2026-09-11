"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  LayoutDashboard,
  FilePlus,
  Landmark,
  Mail,
  ClipboardList,
  Settings,
  LogOut,
  FileText,
  Tags,
  FileSignature,
  Layers,
} from "lucide-react";
import { signOutAction } from "@/server/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarUser {
  name?: string | null;
  image?: string | null;
  isAdmin: boolean;
  baseRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  loan_officer: "Loan Officer",
  loan_officer_assistant: "Loan Officer Assistant",
  processor: "Processor",
};

export function AppSidebar({ user, companyName }: { user: SidebarUser; companyName: string }) {
  const pathname = usePathname();

  const mainLinks = [
    { href: "/", label: "Pipeline", icon: LayoutDashboard, exact: true },
    { href: "/deals/new", label: "New Deal", icon: FilePlus, exact: true },
    { href: "/lenders", label: "Lenders", icon: Landmark, exact: false },
    ...(user.isAdmin
      ? [
          { href: "/client-needs", label: "Client Needs", icon: ClipboardList, exact: true },
          { href: "/email-templates", label: "Email Templates", icon: Mail, exact: true },
        ]
      : []),
  ];

  // "/deals/new" is a static route (the staff new-deal form), not a deal id —
  // only an actual "/deals/<uuid>..." path switches the sidebar into deal mode.
  const dealMatch = pathname.match(/^\/deals\/([^/]+)/);
  const dealId = dealMatch && dealMatch[1] !== "new" ? dealMatch[1] : null;

  const dealLinks = dealId
    ? [
        { href: `/deals/${dealId}`, label: "Overview", icon: FileText, exact: true },
        { href: `/deals/${dealId}/pricing`, label: "Pricing", icon: Tags, exact: true },
        { href: `/deals/${dealId}/term-sheets`, label: "Term Sheets", icon: FileSignature, exact: true },
        { href: `/deals/${dealId}/loan-center`, label: "Loan Center", icon: Layers, exact: false },
      ]
    : [];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-[#111318] text-zinc-300">
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        <Link href="/" className="truncate font-semibold text-white">
          {companyName}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {dealId ? (
          <>
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <ArrowLeft className="size-4" />
              Pipeline
            </Link>
            <div className="my-2 border-t border-white/10" />
            {dealLinks.map((link) => {
              const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              );
            })}
          </>
        ) : (
          mainLinks.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href) || (link.href === "/lenders" && pathname.startsWith("/products"));
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })
        )}
      </nav>

      <div className="space-y-1 border-t border-white/10 p-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-white/10 text-white"
              : "text-zinc-400 hover:bg-white/5 hover:text-white"
          )}
        >
          <Settings className="size-4" />
          Settings
        </Link>

        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar className="size-7">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
            <AvatarFallback>{user.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">
              {ROLE_LABELS[user.baseRole] ?? user.baseRole}
            </p>
          </div>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              className="text-zinc-400 hover:bg-white/10 hover:text-white"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
