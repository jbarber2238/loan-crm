"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoteText } from "@/components/deals/note-text";
import { notePlainText } from "@/lib/note-format";
import { COMPOSE_UPDATE_EVENT, COMPOSE_UPDATE_KEY, LOAN_CENTER_GOTO_EVENT } from "@/lib/loan-center-events";
import { BANNER_REOPEN_MS, parseUpdateSections, updateAgeChip, updateAgeDays, type AgeTone } from "@/lib/tasks";
import type { LatestUpdate } from "@/server/tasks";
import { cn } from "@/lib/utils";

const TONE_VARIANT: Record<AgeTone, "success" | "outline" | "warning" | "destructive"> = {
  ok: "success",
  muted: "outline",
  warn: "warning",
  bad: "destructive",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

// The two conversation tabs fill the screen, so (like the deal header) the banner steps aside there.
const CONVERSATION_HIDE = "[html[data-loan-tab=communications]_&]:hidden [html[data-loan-tab=team-chat]_&]:hidden";

function seenKey(userId: string, dealId: string) {
  return `crm.latest-update-seen:${userId}:${dealId}`;
}

/**
 * The newest end-of-day update, right under the deal header. It opens by itself the first time this person opens
 * the deal in any 24 hours, then sits as a one-line bar (with how many days old it is) that they can open again.
 * What counts as "seen" is remembered in this browser only; nothing about it is saved on the server.
 */
export function LatestUpdateBanner({ dealId, userId, update }: { dealId: string; userId: string; update: LatestUpdate | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState<"auto" | "manual" | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const lastPath = useRef(pathname);

  // First open in 24 hours (for this person, in this browser): show it open, and note the time.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    if (!update) return;
    let show = true;
    try {
      const seen = Number(localStorage.getItem(seenKey(userId, dealId)));
      show = !seen || Date.now() - seen >= BANNER_REOPEN_MS;
      if (show) localStorage.setItem(seenKey(userId, dealId), String(Date.now()));
    } catch {
      // Storage blocked: err on the side of showing it only when it's a different update than the last one this tab saw.
    }
    if (show) {
      setExpanded(true);
      setOpened("auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, userId]);

  // Moving to another part of the deal tucks an automatically opened update away.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (opened === "auto") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(false);
      setOpened(null);
    }
  }, [pathname, opened]);

  const sections = useMemo(() => (update ? parseUpdateSections(update.body) : null), [update]);

  function goToNotes(compose: boolean) {
    if (compose) {
      try {
        sessionStorage.setItem(COMPOSE_UPDATE_KEY, dealId);
      } catch {
        // Fine: the Notes tab just opens without a started draft.
      }
    }
    if (opened === "auto") {
      setExpanded(false);
      setOpened(null);
    }
    if (pathname === `/deals/${dealId}/loan-center`) {
      window.dispatchEvent(new CustomEvent(LOAN_CENTER_GOTO_EVENT, { detail: { tab: "notes" } }));
      if (compose) window.dispatchEvent(new Event(COMPOSE_UPDATE_EVENT));
    } else {
      router.push(`/deals/${dealId}/loan-center?tab=notes`);
    }
  }

  if (!update) {
    return (
      <section aria-label="Latest update" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground", CONVERSATION_HIDE)}>
        <Badge variant="warning">No update yet</Badge>
        <span>Nobody has posted an end-of-day update on this deal.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => goToNotes(true)}>
          Write the first update
        </Button>
      </section>
    );
  }

  const age = now === null ? null : updateAgeDays(new Date(update.createdAt), new Date(now));
  const chip = age === null ? null : updateAgeChip(age);
  const firstLine = notePlainText((sections ? sections[0].text : update.body).split("\n").find((l) => l.trim()) ?? "");
  const fresh = expanded && opened === "auto";

  return (
    <section aria-label="Latest update" className={cn("overflow-hidden rounded-xl border bg-card", fresh && "border-primary/50", CONVERSATION_HIDE)}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((v) => !v);
          setOpened(expanded ? null : "manual");
        }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/50"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <span className="text-sm font-semibold whitespace-nowrap">Latest update</span>
        <span className="text-xs whitespace-nowrap text-muted-foreground max-sm:whitespace-normal">
          {update.authorName} · {when(update.createdAt)}
        </span>
        {chip && <Badge variant={TONE_VARIANT[chip.tone]}>{chip.text}</Badge>}
        {!expanded && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground max-sm:hidden">{firstLine}</span>}
        <span className="ml-auto text-xs font-semibold whitespace-nowrap text-primary">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-4 py-3.5">
          {sections ? (
            <div className={cn("grid gap-x-6 gap-y-3", sections.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
              {sections.map((s) => (
                <div key={s.key}>
                  <h4 className="mb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{s.label}</h4>
                  {s.text ? <NoteText body={s.text} /> : <p className="text-sm">—</p>}
                </div>
              ))}
            </div>
          ) : (
            <NoteText body={update.body} />
          )}

          {age !== null && age >= 2 && (
            <p className={cn("rounded-lg px-3 py-2 text-xs", age >= 5 ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
              <strong>{age} days since this update.</strong> If nothing has changed, you&apos;re set. If it has, post a fresh end-of-day update.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted-foreground">
              {fresh ? "Opens by itself the first time you open a deal each day, then stays as the one-line bar." : "Opened by you. It stays tucked away next time."}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => goToNotes(false)}>
              See all notes
            </Button>
            {age !== null && age >= 2 && (
              <Button type="button" size="sm" variant="outline" onClick={() => goToNotes(true)}>
                Write today&apos;s update
              </Button>
            )}
            {fresh && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setExpanded(false);
                  setOpened(null);
                }}
              >
                Got it
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
