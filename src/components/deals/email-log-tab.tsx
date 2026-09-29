"use client";

import { useMemo, useState } from "react";
import { Mail, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EMAIL_LOG_CATEGORY_LABELS, AUTOMATIC_EMAIL_CATEGORIES, emailLogCategoryLabel } from "@/lib/email-log-categories";
import type { EmailLogEntry } from "@/server/actions/email-log";

const DATE_RANGES = {
  all: { label: "All time", days: null },
  "7": { label: "Last 7 days", days: 7 },
  "30": { label: "Last 30 days", days: 30 },
  "90": { label: "Last 90 days", days: 90 },
} as const;

type DateRangeKey = keyof typeof DATE_RANGES;

function isAutomatic(category: string): boolean {
  return AUTOMATIC_EMAIL_CATEGORIES.has(category);
}

function cutoffDateFor(days: number | null): Date | null {
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
}

export function EmailLogTab({ entries }: { entries: EmailLogEntry[] }) {
  const [senderFilter, setSenderFilter] = useState<string>("all");
  const [rangeFilter, setRangeFilter] = useState<DateRangeKey>("all");
  const [openEntry, setOpenEntry] = useState<EmailLogEntry | null>(null);

  const senders = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.sentByUserId) map.set(e.sentByUserId, e.sentByUserName ?? "Unknown");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const cutoffDate = cutoffDateFor(DATE_RANGES[rangeFilter].days);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (senderFilter !== "all" && e.sentByUserId !== senderFilter) return false;
      if (cutoffDate && e.sentAt < cutoffDate) return false;
      return true;
    });
  }, [entries, senderFilter, cutoffDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={senderFilter} onValueChange={setSenderFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {senders.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as DateRangeKey)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(DATE_RANGES) as [DateRangeKey, (typeof DATE_RANGES)[DateRangeKey]][]).map(
              ([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {filtered.length} email{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2">
        {filtered.map((entry) => (
          <Card
            key={entry.id}
            className="cursor-pointer transition-colors hover:bg-accent/50"
            onClick={() => setOpenEntry(entry)}
          >
            <CardContent className="flex items-center gap-3 py-3">
              {isAutomatic(entry.category) ? (
                <Zap className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Mail className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{entry.subject}</p>
                  <Badge variant={isAutomatic(entry.category) ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                    {emailLogCategoryLabel(entry.category)}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">To: {entry.toEmail}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{entry.sentByUserName ?? "System"}</p>
                <p>{entry.sentAt.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {entries.length === 0 ? "No emails sent yet on this deal." : "No emails match these filters."}
          </p>
        )}
      </div>

      <Dialog open={openEntry !== null} onOpenChange={(open) => !open && setOpenEntry(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {openEntry && (
            <>
              <DialogHeader>
                <DialogTitle>{openEntry.subject}</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-0.5 text-left text-xs">
                    <p>
                      From {openEntry.sentByUserName ?? "System"} · {openEntry.sentAt.toLocaleString()}
                    </p>
                    <p>To: {openEntry.toEmail}</p>
                    {openEntry.ccEmail && <p>Cc: {openEntry.ccEmail}</p>}
                    <p>{EMAIL_LOG_CATEGORY_LABELS[openEntry.category] ?? openEntry.category}</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div
                className="rounded-md border p-4 text-sm [&_a]:underline [&_img]:h-auto [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: openEntry.bodyHtml }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
