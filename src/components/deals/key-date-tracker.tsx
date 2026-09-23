"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, History, Mail, StickyNote, Trash2 } from "lucide-react";
import {
  addKeyDateEvent,
  deleteKeyDateEvent,
  previewKeyDateOrderEmail,
  resetKeyDateItem,
  sendKeyDateOrderEmail,
  updateKeyDateNotes,
} from "@/server/actions/key-date-tracker";
import { KEY_DATE_ITEMS, currentEventFor, type KeyDateEvent, type KeyDateItem } from "@/lib/key-date-tracker";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecipientLine } from "@/components/emails/recipient-line";
import { SignaturePreview } from "@/components/emails/signature-preview";
import { HtmlBodyEditor } from "@/components/emails/html-body-editor";
import type { RecipientCandidate } from "@/lib/email-recipients";
import { AppraisalDocumentCell } from "@/components/deals/appraisal-document-cell";
import { cn } from "@/lib/utils";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Cycled by position in an item's status list so each stage gets its own
// color at a glance — same palette across items, since the meaning ("early"
// vs. "late" in that item's process) is the same regardless of item.
const STATUS_COLORS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
];

function statusColorClass(index: number) {
  return STATUS_COLORS[index % STATUS_COLORS.length];
}

function StatusRow({
  label,
  colorClass,
  isCurrent,
  loggedDate,
  onPick,
}: {
  label: string;
  colorClass: string;
  isCurrent: boolean;
  loggedDate: Date | null;
  onPick: (dateStr: string) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium",
        colorClass,
        isCurrent && "ring-2 ring-blue-500"
      )}
    >
      <button type="button" className="flex-1 text-left" onClick={() => onPick(todayInputValue())}>
        {label}
      </button>
      {editingDate ? (
        <input
          type="date"
          autoFocus
          defaultValue={loggedDate ? loggedDate.toISOString().slice(0, 10) : todayInputValue()}
          onBlur={() => setEditingDate(false)}
          onChange={(e) => {
            if (e.target.value) onPick(e.target.value);
            setEditingDate(false);
          }}
          className="w-32 rounded border bg-background px-1 py-0.5 text-xs text-foreground"
        />
      ) : loggedDate ? (
        <button
          type="button"
          onClick={() => setEditingDate(true)}
          className="text-xs opacity-80 hover:underline"
          title="Click to change the date"
        >
          {formatDate(loggedDate)}
        </button>
      ) : (
        <button type="button" onClick={() => setEditingDate(true)} title="Pick a specific date">
          <Calendar className="size-4 opacity-60 hover:opacity-100" />
        </button>
      )}
    </div>
  );
}

function StatusSelector({
  dealId,
  item,
  events,
}: {
  dealId: string;
  item: KeyDateItem;
  events: KeyDateEvent[];
}) {
  const router = useRouter();
  const config = KEY_DATE_ITEMS.find((i) => i.key === item)!;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = currentEventFor(item, events);
  // Most recent date logged for each status label, so re-opening later shows
  // it inline instead of a bare calendar icon — this list doubles as a
  // quick "when did each stage happen" glance, not just a picker.
  const latestDateByStatus = new Map<string, Date>();
  for (const e of events) {
    if (!latestDateByStatus.has(e.status)) latestDateByStatus.set(e.status, e.eventDate);
  }

  function handlePick(status: string, dateStr: string) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("status", status);
        formData.set("eventDate", dateStr);
        await addKeyDateEvent(dealId, item, formData);
        toast.success("Status updated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update status.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium",
            current ? statusColorClass(config.statuses.indexOf(current.status)) : "bg-muted text-foreground"
          )}
        >
          {current?.status ?? "Not Ordered"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div
          className={cn(
            "flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium",
            !current && "ring-2 ring-blue-500"
          )}
        >
          Not Ordered
        </div>
        {config.statuses.map((status, i) => (
          <StatusRow
            key={status}
            label={status}
            colorClass={statusColorClass(i)}
            isCurrent={current?.status === status}
            loggedDate={latestDateByStatus.get(status) ?? null}
            onPick={(dateStr) => handlePick(status, dateStr)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function AuditTrailDialog({
  dealId,
  item,
  label,
  events,
}: {
  dealId: string;
  item: KeyDateItem;
  label: string;
  events: KeyDateEvent[];
}) {
  const config = KEY_DATE_ITEMS.find((i) => i.key === item)!;
  const rootStatus = config.statuses[0];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" title="Audit trail" disabled={events.length === 0}>
          <History className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} — audit trail</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {events.map((e) => {
            const isRoot = e.status === rootStatus;
            return (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{e.status}</span>{" "}
                  <span className="text-muted-foreground">
                    {formatDate(e.eventDate)}
                    {e.createdByName && ` · logged by ${e.createdByName}`}
                  </span>
                </div>
                <ActionForm
                  action={isRoot ? resetKeyDateItem.bind(null, dealId, item) : deleteKeyDateEvent.bind(null, dealId, e.id)}
                  successMessage="Entry deleted"
                  confirmMessage={
                    isRoot
                      ? `Delete "${e.status}"? This wipes the entire history for ${label} and resets it to Not Ordered. Do you really want to delete everything?`
                      : `Delete "${e.status}" (${formatDate(e.eventDate)})? This can't be undone.`
                  }
                >
                  <SubmitButton size="icon-sm" variant="ghost" className="shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </SubmitButton>
                </ActionForm>
              </li>
            );
          })}
          {events.length === 0 && <p className="text-sm text-muted-foreground">No history yet.</p>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({
  dealId,
  item,
  label,
  notes,
}: {
  dealId: string;
  item: KeyDateItem;
  label: string;
  notes: string | null;
}) {
  const router = useRouter();
  const updateNotes = updateKeyDateNotes.bind(null, dealId, item);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateNotes(formData);
        setOpen(false);
        toast.success("Notes saved");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save notes.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" title="Notes">
          <StickyNote className={notes ? "size-4 text-primary" : "size-4"} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} — notes</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea name="notes" rows={4} defaultValue={notes ?? ""} placeholder="Anything worth flagging…" />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderEmailDialog({
  dealId,
  item,
  label,
  hasContact,
}: {
  dealId: string;
  item: "insurance" | "title";
  label: string;
  hasContact: boolean;
}) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [candidates, setCandidates] = useState<RecipientCandidate[]>([]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setLoading(true);
    previewKeyDateOrderEmail(dealId, item)
      .then((preview) => {
        setSubject(preview.subject);
        setBody(preview.body);
        setTo(preview.to);
        setCc(preview.cc);
        setSignatureHtml(preview.signatureHtml);
        setCandidates(preview.candidates);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't build this email."))
      .finally(() => setLoading(false));
  }

  function handleSend() {
    setError(null);
    const finalBody = bodyRef.current?.innerHTML ?? body;
    startSend(async () => {
      try {
        await sendKeyDateOrderEmail(dealId, item, to, cc, subject, finalBody);
        setOpen(false);
        toast.success("Email sent");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send this email.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={!hasContact} title={hasContact ? undefined : "Add a contact under Roles and Key Contacts first"}>
          <Mail className="size-3.5" />
          Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Order {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error && !subject ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <RecipientLine id={`order-to-${item}`} label="To" value={to} onChange={setTo} candidates={candidates} />
              <RecipientLine id={`order-cc-${item}`} label="Cc" value={cc} onChange={setCc} candidates={candidates} />
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div className="space-y-1.5">
              <Label>Email preview — click any text below to edit it</Label>
              <HtmlBodyEditor html={body} bodyRef={bodyRef} />
            </div>
            <SignaturePreview html={signatureHtml} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="w-full" disabled={sending} onClick={handleSend}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ContactInfo {
  insuranceEmail: string | null;
  titleEmail: string | null;
}

export function KeyDateTracker({
  dealId,
  loanCategory,
  events,
  appraisalNotes,
  insuranceNotes,
  titleNotes,
  insuranceEmail,
  titleEmail,
  appraisalDocumentFileName,
}: {
  dealId: string;
  loanCategory: string;
  events: KeyDateEvent[];
  appraisalDocumentFileName: string | null;
} & ContactInfo & {
    appraisalNotes: string | null;
    insuranceNotes: string | null;
    titleNotes: string | null;
  }) {
  const notesByItem: Record<KeyDateItem, string | null> = {
    appraisal: appraisalNotes,
    insurance: insuranceNotes,
    title: titleNotes,
  };
  const contactByItem: Partial<Record<KeyDateItem, string | null>> = {
    insurance: insuranceEmail,
    title: titleEmail,
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Item</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium"></th>
                <th className="pb-2 pr-3 font-medium"></th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {KEY_DATE_ITEMS.map((config) => {
                const itemEvents = events.filter((e) => e.item === config.key);
                const latest = currentEventFor(config.key, itemEvents);
                return (
                  <tr key={config.key} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{config.label}</td>
                    <td className="py-2.5 pr-3">
                      <StatusSelector dealId={dealId} item={config.key} events={itemEvents} />
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {latest ? formatDate(latest.eventDate) : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {config.key === "appraisal" && (
                        <AppraisalDocumentCell
                          dealId={dealId}
                          loanCategory={loanCategory}
                          fileName={appraisalDocumentFileName}
                        />
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {config.emailable && (
                        <OrderEmailDialog
                          dealId={dealId}
                          item={config.key as "insurance" | "title"}
                          label={config.label}
                          hasContact={Boolean(contactByItem[config.key])}
                        />
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <NotesDialog
                          dealId={dealId}
                          item={config.key}
                          label={config.label}
                          notes={notesByItem[config.key]}
                        />
                        <AuditTrailDialog dealId={dealId} item={config.key} label={config.label} events={itemEvents} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
