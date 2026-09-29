"use client";

import { useEffect, useState } from "react";
import { getClientNeedReminderAudit, type ReminderAuditEntry } from "@/server/actions/email-log";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ClientNeedReminderAuditDialog({
  dealId,
  needId,
  needName,
  open,
  onOpenChange,
}: {
  dealId: string;
  needId: string;
  needName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<{ needId: string; entries: ReminderAuditEntry[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    getClientNeedReminderAudit(dealId, needId).then((entries) => setResult({ needId, entries }));
  }, [open, dealId, needId]);

  const entries = result?.needId === needId ? result.entries : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reminder history</DialogTitle>
          <DialogDescription>
            Every time the borrower was emailed about &quot;{needName}&quot;, manually or automatically.
          </DialogDescription>
        </DialogHeader>

        {entries === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Never reminded — no email has covered this need yet.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Reminded {entries.length} time{entries.length === 1 ? "" : "s"}
            </p>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {entries.map((e, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{e.sentAt.toLocaleString()}</span>
                  <div className="flex items-center gap-2">
                    {e.senderName && <span className="text-xs text-muted-foreground">{e.senderName}</span>}
                    <Badge variant={e.category === "client_needs_reminder_auto" ? "secondary" : "outline"} className="text-[10px]">
                      {e.category === "client_needs_reminder_auto" ? "Automatic" : "Manual"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
