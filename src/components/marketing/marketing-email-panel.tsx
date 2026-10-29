"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmailTemplateCard } from "@/components/email-templates/email-template-card";
import { resetEmailTiming, saveFridayClockTime, saveFridayNudgeDelay, setMarketingEmailActive } from "@/server/actions/marketing-email";
import { savePartnerInviteSettings } from "@/server/actions/partners";
import { DEFAULT_FRIDAY_TIMES, FRIDAY_SCHEDULE_KEYS, formatClock, type ClockTime } from "@/lib/friday-schedule";
import type { MarketingEmailRow, MarketingGroupView } from "@/server/marketing-email";

const DEFAULT_CLOCKS: Record<string, ClockTime> = {
  [FRIDAY_SCHEDULE_KEYS.morningReminder]: DEFAULT_FRIDAY_TIMES.morningReminder,
  [FRIDAY_SCHEDULE_KEYS.hourBefore]: DEFAULT_FRIDAY_TIMES.hourBefore,
  [FRIDAY_SCHEDULE_KEYS.tenMinutes]: DEFAULT_FRIDAY_TIMES.tenMinutes,
  [FRIDAY_SCHEDULE_KEYS.rollForward]: DEFAULT_FRIDAY_TIMES.rollForward,
  [FRIDAY_SCHEDULE_KEYS.followUp]: DEFAULT_FRIDAY_TIMES.followUp,
};

const pad = (n: number) => String(n).padStart(2, "0");

function lastSent(iso: string | null): string {
  if (!iso) return "Not sent yet";
  return `Last sent ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))} ET`;
}

/**
 * Everything on the Email Campaigns tab, each part collapsed under its heading. Expand all and Collapse all at the
 * top, so a long sequence (the Friday Zoom has eight emails) doesn't have to be scrolled through to reach the next.
 */
export function MarketingEmailPanel({ groups, campaignsCount, campaigns }: { groups: MarketingGroupView[]; campaignsCount: number; campaigns: ReactNode }) {
  const ids = ["mine", ...groups.map((g) => g.id)];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(new Set(ids))} disabled={open.size === ids.length}>
          Expand all
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(new Set())} disabled={open.size === 0}>
          Collapse all
        </Button>
        <span className="text-xs text-muted-foreground">
          {open.size} of {ids.length} open
        </span>
      </div>

      <section className="rounded-lg border">
        <SectionHeader
          open={open.has("mine")}
          onToggle={() => toggle("mine")}
          title="Your campaigns"
          detail={`${campaignsCount} ${campaignsCount === 1 ? "campaign" : "campaigns"}`}
          summary="Emails you built in the Email Builder: where each one stands, who got it and who clicked."
        />
        {open.has("mine") && <div className="border-t p-4">{campaigns}</div>}
      </section>

      <p className="max-w-3xl pt-2 text-sm text-muted-foreground">
        Automatic emails: who gets each one, when it goes out, and whether it&apos;s on. Switch an email off to stop it, change a time to move it, or open the wording to edit it. All times are Eastern.
      </p>

      {groups.map((group) => (
        <section key={group.id} className="rounded-lg border">
          <SectionHeader
            open={open.has(group.id)}
            onToggle={() => toggle(group.id)}
            title={group.title}
            detail={`${group.rows.length} emails${group.sentLast30Days !== null ? ` · ${group.sentLast30Days} sent in the last 30 days` : ""}`}
            summary={group.summary}
          />
          {open.has(group.id) && (
            <>
              {group.partner && (
                <div className="border-t p-4 pb-2">
                  <PartnerSchedule reminderDays={group.partner.reminderDays} expiresDays={group.partner.expiresDays} />
                </div>
              )}
              <ul className="divide-y border-t">
                {group.rows.map((row) => (
                  <EmailRow key={row.email.templateKey} row={row} />
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function SectionHeader({ open, onToggle, title, detail, summary }: { open: boolean; onToggle: () => void; title: string; detail: string; summary: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 p-4 text-left hover:bg-muted/30">
      <ChevronRight className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-base font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </span>
        <span className="block max-w-3xl text-sm text-muted-foreground">{summary}</span>
      </span>
    </button>
  );
}

function EmailRow({ row }: { row: MarketingEmailRow }) {
  const router = useRouter();
  const { email, template } = row;
  const [active, setActive] = useState(template?.active ?? false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await setMarketingEmailActive(email.templateKey, next);
      if ("error" in result) {
        setActive(!next);
        toast.error(result.error);
      } else {
        toast.success(next ? "Turned on" : "Turned off");
        router.refresh();
      }
    });
  }

  return (
    <li className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          {email.canToggle ? (
            <Switch checked={active} onCheckedChange={toggle} disabled={pending || !template} aria-label={`${email.title} on or off`} />
          ) : (
            <Badge variant="secondary">Always on</Badge>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{email.title}</h3>
            {email.canToggle && !active && <Badge variant="secondary">Off</Badge>}
            {row.customized && <Badge variant="outline">Custom time</Badge>}
          </div>
          <p className="text-sm">{email.when}</p>
          <p className="text-xs text-muted-foreground">{email.audience}</p>
          {row.sentLast30Days !== null && (
            <p className="text-xs text-muted-foreground">
              {row.sentLast30Days} sent in the last 30 days · {lastSent(row.lastSentAt)}
            </p>
          )}
          {email.timing.type === "clock" && row.clock && <ClockEditor templateKey={email.timing.key} current={row.clock} customized={row.customized} />}
          {email.timing.type === "delay" && row.delayDays !== null && <DelayEditor current={row.delayDays} customized={row.customized} />}
        </div>
        {template && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit wording"}
          </Button>
        )}
      </div>
      {editing && template && <EmailTemplateCard template={template} defaultOpen />}
    </li>
  );
}

function ClockEditor({ templateKey, current, customized }: { templateKey: string; current: ClockTime; customized: boolean }) {
  const router = useRouter();
  const fallback = DEFAULT_CLOCKS[templateKey];
  const [value, setValue] = useState(`${pad(current.hour)}:${pad(current.minute)}`);
  const [pending, startTransition] = useTransition();

  function save() {
    const [hour, minute] = value.split(":").map(Number);
    startTransition(async () => {
      const result = await saveFridayClockTime(templateKey, hour, minute);
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Time saved");
        router.refresh();
      }
    });
  }
  function reset() {
    startTransition(async () => {
      await resetEmailTiming(templateKey);
      setValue(`${pad(fallback.hour)}:${pad(fallback.minute)}`);
      toast.success(`Back to ${formatClock(fallback)} ET`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Label htmlFor={`t-${templateKey}`} className="text-xs text-muted-foreground">
        Send at (ET)
      </Label>
      <Input id={`t-${templateKey}`} type="time" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-32" />
      <Button type="button" size="sm" variant="outline" disabled={pending || !value} onClick={save}>
        Save time
      </Button>
      {customized && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={reset}>
          Back to {formatClock(fallback)}
        </Button>
      )}
    </div>
  );
}

function DelayEditor({ current, customized }: { current: number; customized: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState(String(current));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveFridayNudgeDelay(Number(days));
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Saved");
        router.refresh();
      }
    });
  }
  function reset() {
    startTransition(async () => {
      await resetEmailTiming(FRIDAY_SCHEDULE_KEYS.nudge);
      setDays(String(DEFAULT_FRIDAY_TIMES.nudgeDelayDays));
      toast.success(`Back to ${DEFAULT_FRIDAY_TIMES.nudgeDelayDays} days`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Label htmlFor="nudge-days" className="text-xs text-muted-foreground">
        Wait (days)
      </Label>
      <Input id="nudge-days" type="number" min={1} max={10} value={days} onChange={(e) => setDays(e.target.value)} className="h-8 w-20" />
      <Button type="button" size="sm" variant="outline" disabled={pending || !days} onClick={save}>
        Save
      </Button>
      {customized && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={reset}>
          Back to {DEFAULT_FRIDAY_TIMES.nudgeDelayDays} days
        </Button>
      )}
    </div>
  );
}

function PartnerSchedule({ reminderDays, expiresDays }: { reminderDays: string; expiresDays: number }) {
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-3 pt-2"
      action={async (formData) => {
        const result = await savePartnerInviteSettings(formData);
        if (result && "error" in result) toast.error(result.error);
        else {
          toast.success("Saved");
          router.refresh();
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="mk-reminderDays" className="text-xs">
          Send reminders on days
        </Label>
        <Input id="mk-reminderDays" name="reminderDays" defaultValue={reminderDays} placeholder="2, 5, 9, 14" className="h-8 w-44" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mk-expiresDays" className="text-xs">
          Link expires after (days)
        </Label>
        <Input id="mk-expiresDays" name="expiresDays" type="number" min={1} defaultValue={expiresDays} className="h-8 w-36" />
      </div>
      <Button type="submit" size="sm" variant="outline">
        Save schedule
      </Button>
      <p className="basis-full text-xs text-muted-foreground">Days count from when the invite was sent. The last reminder is the &quot;final&quot; one. Leave blank for no reminders.</p>
    </form>
  );
}
