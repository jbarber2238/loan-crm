"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SELECT_CLASS } from "@/components/marketing/form-classes";
import { addFollowUp, deleteFollowUp, logFollowUp, resumeFollowUp, setFollowUpMarketing, snoozeFollowUp, stopFollowUp, updateFollowUp } from "@/server/actions/follow-ups";
import { CADENCES, bucketOf, daysUntilNext, isCadence, type FollowUpCadence } from "@/lib/follow-up-schedule";
import { addDays, etDay } from "@/lib/friday-schedule";
import type { FollowUp } from "@/server/follow-ups";

const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }).format(d);
const CHANNELS = [
  { value: "call", label: "Called" },
  { value: "text", label: "Texted" },
  { value: "email", label: "Emailed" },
  { value: "in_person", label: "Met in person" },
  { value: "other", label: "Other" },
];

type Run = (fn: () => Promise<{ ok: true } | { error: string }>, success: string) => void;

function useRun(): { run: Run; pending: boolean } {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run: Run = (fn, success) =>
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(success);
        router.refresh();
      }
    });
  return { run, pending };
}

export function FollowUpAssistant({ contacts, nowIso }: { contacts: FollowUp[]; nowIso: string }) {
  const now = new Date(nowIso);
  const due = contacts.filter((c) => bucketOf(c, now) === "due");
  const upcoming = contacts.filter((c) => bucketOf(c, now) === "upcoming");
  const stopped = contacts.filter((c) => bucketOf(c, now) === "stopped");
  return (
    <div className="space-y-6">
      <AddForm />
      <Section title="Due now" empty="Nobody is due. You're caught up." contacts={due} now={now} tone="due" />
      <Section title="Coming up" empty="Nobody scheduled yet." contacts={upcoming} now={now} tone="upcoming" />
      {stopped.length > 0 && <Section title="Stopped" empty="" contacts={stopped} now={now} tone="stopped" />}
    </div>
  );
}

function AddForm() {
  const { run, pending } = useRun();
  const blank = { name: "", email: "", phone: "", notes: "", cadence: "smart", marketingOk: null as boolean | null, firstDay: "" };
  const [f, setF] = useState(blank);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const cadence = isCadence(f.cadence) ? f.cadence : "smart";
  const defaultDay = addDays(etDay(new Date()), daysUntilNext(cadence, 0));

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="text-base font-semibold">Add someone to follow up with</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Enter who they are and I&apos;ll remind you when it&apos;s time to reach out personally, and keep reminding you on a schedule until you stop it. If they haven&apos;t agreed to marketing, they stay
          off every email list and it&apos;s just you and your phone.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fu-name">Name</Label>
          <Input id="fu-name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-email">Email</Label>
          <Input id="fu-email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-phone">Phone</Label>
          <Input id="fu-phone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-cadence">Remind me</Label>
          <select id="fu-cadence" className={SELECT_CLASS} value={f.cadence} onChange={(e) => set({ cadence: e.target.value })}>
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}: {c.description}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-first">First reminder</Label>
          <Input id="fu-first" type="date" value={f.firstDay || defaultDay} min={etDay(new Date())} onChange={(e) => set({ firstDay: e.target.value })} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">OK to send them marketing emails?</legend>
          <div className="flex gap-2">
            {[
              { v: true, label: "Yes, they agreed" },
              { v: false, label: "No, personal only" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => set({ marketingOk: o.v })}
                className={`rounded-md border px-3 py-1.5 text-sm ${f.marketingOk === o.v ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fu-notes">Notes (optional)</Label>
        <Textarea id="fu-notes" rows={2} placeholder="Where you met, what they're working on" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <Button
        disabled={pending || f.marketingOk === null || !f.name.trim()}
        onClick={() =>
          run(
            () => addFollowUp({ name: f.name, email: f.email, phone: f.phone, notes: f.notes, cadence: f.cadence, marketingOk: f.marketingOk === true, firstDay: f.firstDay || defaultDay }),
            `I'll remind you to follow up with ${f.name.trim()}`
          )
        }
      >
        Add and start reminders
      </Button>
      {f.marketingOk === null && <p className="text-xs text-muted-foreground">Choose whether they agreed to marketing so there&apos;s never a guess.</p>}
    </section>
  );
}

function Section({ title, empty, contacts, now, tone }: { title: string; empty: string; contacts: FollowUp[]; now: Date; tone: "due" | "upcoming" | "stopped" }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">({contacts.length})</span>
      </h2>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <Card key={c.id} c={c} now={now} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ c, now, tone }: { c: FollowUp; now: Date; tone: "due" | "upcoming" | "stopped" }) {
  const { run, pending } = useRun();
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [log, setLog] = useState({ channel: "call", note: "", nextDay: "" });
  const cadence: FollowUpCadence = isCadence(c.cadence) ? c.cadence : "smart";
  const autoNext = addDays(etDay(now), daysUntilNext(cadence, c.touchCount + 1));
  const overdueDays = c.nextFollowUpAt ? Math.floor((now.getTime() - c.nextFollowUpAt.getTime()) / 86_400_000) : 0;

  return (
    <li className={`space-y-3 rounded-lg border p-3 ${tone === "due" ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{c.name}</span>
            {c.marketingOk ? <Badge variant="success">OK to market to</Badge> : <Badge variant="outline">Personal only</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.phone && (
              <>
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3.5" /> {c.phone}
                </a>
                <a href={`sms:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <MessageSquare className="size-3.5" /> Text
                </a>
              </>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="size-3.5" /> {c.email}
              </a>
            )}
          </div>
          {c.notes && <p className="pt-1 text-sm">{c.notes}</p>}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {tone === "stopped" ? (
            <div>Reminders stopped</div>
          ) : c.nextFollowUpAt ? (
            <div className={tone === "due" ? "font-medium text-foreground" : ""}>
              {tone === "due" ? (overdueDays >= 1 ? `Overdue ${overdueDays} day${overdueDays === 1 ? "" : "s"}` : "Due today") : `Next: ${dayLabel(c.nextFollowUpAt)}`}
            </div>
          ) : null}
          <div>
            {c.touchCount} follow-up{c.touchCount === 1 ? "" : "s"} so far
          </div>
          {c.lastTouch && (
            <div>
              Last: {CHANNELS.find((ch) => ch.value === c.lastTouch!.channel)?.label.toLowerCase() ?? "contacted"} {dayLabel(c.lastTouch.at)}
              {c.lastTouch.note ? ` — ${c.lastTouch.note}` : ""}
            </div>
          )}
        </div>
      </div>

      {logging && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <select className={SELECT_CLASS} value={log.channel} onChange={(e) => setLog({ ...log, channel: e.target.value })} aria-label="How you followed up">
              {CHANNELS.map((ch) => (
                <option key={ch.value} value={ch.value}>
                  {ch.label}
                </option>
              ))}
            </select>
            <Input className="sm:col-span-2" placeholder="What happened? (optional)" value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={`next-${c.id}`} className="text-sm">
              Remind me again
            </Label>
            <Input id={`next-${c.id}`} className="w-40" type="date" min={etDay(now)} value={log.nextDay || autoNext} onChange={(e) => setLog({ ...log, nextDay: e.target.value })} />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => logFollowUp(c.id, { channel: log.channel, note: log.note, nextDay: log.nextDay || null }),
                  "Logged. Next reminder is set."
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLogging(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {tone !== "stopped" && !logging && (
          <Button size="sm" onClick={() => setLogging(true)}>
            I followed up
          </Button>
        )}
        {tone !== "stopped" && (
          <select
            className={`${SELECT_CLASS} !w-auto`}
            aria-label="Snooze"
            value=""
            disabled={pending}
            onChange={(e) => e.target.value && run(() => snoozeFollowUp(c.id, Number(e.target.value)), "Snoozed")}
          >
            <option value="">Snooze…</option>
            <option value="1">Tomorrow</option>
            <option value="3">3 days</option>
            <option value="7">1 week</option>
            <option value="14">2 weeks</option>
            <option value="30">1 month</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={c.marketingOk} disabled={pending} onChange={(e) => run(() => setFollowUpMarketing(c.id, e.target.checked), e.target.checked ? "Added to the marketing list" : "Taken off the marketing list")} />
          Agreed to marketing
        </label>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {tone === "stopped" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resumeFollowUp(c.id), "Reminders restarted")}>
              Restart reminders
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => stopFollowUp(c.id), "Reminders stopped")}>
              Stop reminders
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete ${c.name} and their follow-up history?`)) run(() => deleteFollowUp(c.id), "Deleted");
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      <EditDialog c={c} open={editing} onClose={() => setEditing(false)} />
    </li>
  );
}

function EditDialog({ c, open, onClose }: { c: FollowUp; open: boolean; onClose: () => void }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "", cadence: c.cadence });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {c.name}</DialogTitle>
          <DialogDescription>Changes how I remind you. The next reminder date stays as it is.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input aria-label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input aria-label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input aria-label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <select className={SELECT_CLASS} aria-label="Reminder schedule" value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value })}>
            {CADENCES.map((ch) => (
              <option key={ch.value} value={ch.value}>
                {ch.label}: {ch.description}
              </option>
            ))}
          </select>
          <Textarea aria-label="Notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              run(() => updateFollowUp(c.id, f), "Saved");
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
