"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  FolderOpen,
  ListChecks,
  Mail,
  MessageSquare,
  MoreHorizontal,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { LoanCenterNavContext } from "@/components/deals/loan-center-nav-context";
import { cn } from "@/lib/utils";

type TabItem = { value: string; label: string; short: string; icon: LucideIcon };

const TABS: TabItem[] = [
  { value: "client-needs", label: "Client Needs", short: "Needs", icon: ClipboardList },
  { value: "conditions", label: "Conditions", short: "Conditions", icon: ListChecks },
  { value: "roles", label: "Roles and Key Contacts", short: "Contacts", icon: Users },
  { value: "key-dates", label: "Key Dates", short: "Dates", icon: CalendarDays },
  { value: "email-log", label: "Email Log", short: "Emails", icon: Mail },
  { value: "notes", label: "Notes", short: "Notes", icon: StickyNote },
  { value: "documents", label: "Documents", short: "Docs", icon: FolderOpen },
  { value: "team-chat", label: "Team Chat", short: "Chat", icon: MessageSquare },
];

// Four shortcuts live on the bar; the rest sit behind "More" (iOS tab bars top out at five).
const BAR_VALUES = ["client-needs", "conditions", "key-dates", "documents"];
const BAR = BAR_VALUES.map((v) => TABS.find((t) => t.value === v)!);
const MORE = TABS.filter((t) => !BAR_VALUES.includes(t.value));

/**
 * Loan Center tab switcher. On laptops it's the usual pill row above the
 * content; on phones and iPads (below lg) the row is replaced by an
 * iOS-style bar pinned to the bottom of the screen, within thumb reach.
 */
export function LoanCenterTabsShell({ initialTab, children }: { initialTab?: string; children: React.ReactNode }) {
  const [tab, setTab] = useState(initialTab && TABS.some((t) => t.value === initialTab) ? initialTab : "client-needs");
  const [moreOpen, setMoreOpen] = useState(false);

  // Lets the floating chat button sit above the bar instead of behind it.
  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-bar", "calc(4rem + max(env(safe-area-inset-bottom), 0.875rem))");
    return () => {
      document.documentElement.style.removeProperty("--bottom-bar");
    };
  }, []);

  function select(value: string) {
    setTab(value);
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  }

  const moreActive = MORE.some((t) => t.value === tab);

  return (
    <LoanCenterNavContext.Provider value={{ goToTab: select }}>
    <Tabs value={tab} onValueChange={select} className="pb-28 lg:pb-0">
      <TabsList className="max-w-full justify-start overflow-x-auto max-lg:hidden [&>button]:shrink-0">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {children}

      <nav
        aria-label="Loan Center"
        className="fixed inset-x-0 bottom-0 z-30 grid translate-z-0 grid-cols-5 border-t bg-background/95 pb-[max(env(safe-area-inset-bottom),0.875rem)] backdrop-blur lg:hidden"
      >
        {BAR.map((t) => (
          <BarButton key={t.value} item={t} active={tab === t.value} onClick={() => select(t.value)} />
        ))}
        <BarButton
          item={{ value: "more", label: "More", short: "More", icon: MoreHorizontal }}
          active={moreActive}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
          <SheetTitle className="sr-only">More Loan Center sections</SheetTitle>
          <SheetDescription className="sr-only">Pick a section of this loan</SheetDescription>
          <ul className="p-2 pt-4">
            {MORE.map((t) => (
              <li key={t.value}>
                <button
                  type="button"
                  onClick={() => select(t.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left text-base",
                    tab === t.value ? "bg-muted font-semibold" : "hover:bg-muted/60"
                  )}
                >
                  <t.icon className="size-5 text-muted-foreground" />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </Tabs>
    </LoanCenterNavContext.Provider>
  );
}

function BarButton({ item, active, onClick }: { item: TabItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <item.icon className={cn("size-6", active && "stroke-[2.25]")} />
      {item.short}
    </button>
  );
}
