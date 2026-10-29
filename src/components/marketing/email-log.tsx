"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "@/components/marketing/form-classes";
import { markBounced } from "@/server/actions/marketing-audience";
import { saveMarketingLimits } from "@/server/actions/marketing-limits";
import { emailLogCategoryLabel } from "@/lib/email-log-categories";
import { ACCOUNT_TYPES, THRESHOLDS, rate, type CampaignCounts, type CapLevel, type Health } from "@/lib/send-limits";
import type { AuthCheck } from "@/lib/email-auth";
import type { CampaignSendRow, OtherEmailRow } from "@/server/email-log-view";
import type { DayCount, MarketingLimits } from "@/server/send-limits";
import { cn } from "@/lib/utils";

interface CapView {
  used24h: number;
  dailyLimit: number;
  campaignUsed24h: number;
  campaignDailyMax: number;
  level: CapLevel;
  pct: number;
  campaignRoom: number;
  hardStop: number;
}

interface CampaignView {
  id: string;
  name: string;
  status: string;
  pauseReason: string | null;
  lastRunAt: string | null;
  stats: CampaignCounts & { queued: number; skipped: number };
  health: Health;
}

const when = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayShort = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)));
};
const pct = (n: number, of: number) => (of > 0 ? `${rate(n, of).toFixed(1).replace(/\.0$/, "")}%` : "–");

const LEVEL_TEXT: Record<CapLevel, { label: string; variant: "success" | "warning" | "destructive" }> = {
  ok: { label: "Plenty of room", variant: "success" },
  watch: { label: "Getting busy", variant: "warning" },
  near: { label: "Close to the limit", variant: "warning" },
  full: { label: "Campaigns on hold", variant: "destructive" },
};

export function EmailLog({
  senderEmail,
  cap,
  limits,
  history,
  auth,
  campaigns,
  sends,
  others,
}: {
  senderEmail: string;
  cap: CapView;
  limits: MarketingLimits;
  history: DayCount[];
  auth: { domain: string; checks: AuthCheck[] } | null;
  campaigns: CampaignView[];
  sends: CampaignSendRow[];
  others: OtherEmailRow[];
}) {
  return (
    <div className="max-w-5xl space-y-8">
      <SendingLimits cap={cap} limits={limits} history={history} senderEmail={senderEmail} />
      {auth && <Authentication domain={auth.domain} checks={auth.checks} />}
      <CampaignMetrics campaigns={campaigns} />
      <MessageLog sends={sends} others={others} />
    </div>
  );
}

function SendingLimits({ cap, limits, history, senderEmail }: { cap: CapView; limits: MarketingLimits; history: DayCount[]; senderEmail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ accountType: limits.accountType as string, dailyLimit: limits.dailyLimit, campaignDailyMax: limits.campaignDailyMax, minDaysBetween: limits.minDaysBetween });
  const level = LEVEL_TEXT[cap.level];
  const fill = Math.min(100, cap.pct);
  const peak = Math.max(10, ...history.map((d) => d.total));
  const type = ACCOUNT_TYPES.find((t) => t.value === form.accountType);

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Daily sending limit</h2>
        <Badge variant={level.variant}>{level.label}</Badge>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Gmail only lets {senderEmail} send so many emails in a rolling 24 hours, and going over blocks sending for about a day. This counts every email the CRM sent from that account: campaigns, Friday
        reminders, partner reminders and deal emails. Email you send from Gmail itself isn&apos;t counted here, so leave yourself some room.
      </p>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <strong className="text-base tabular-nums">{cap.used24h}</strong> of {cap.dailyLimit} sent in the last 24 hours
          </span>
          <span className="text-muted-foreground">
            Campaigns have {cap.campaignRoom} left right now (up to {cap.campaignDailyMax} a day, and they stop at {cap.hardStop} total)
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(cap.pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full", cap.level === "ok" ? "bg-green-600" : cap.level === "full" ? "bg-red-600" : "bg-amber-500")} style={{ width: `${fill}%` }} />
          <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: "90%" }} title="Campaigns stop here" />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Last 14 days</p>
        <div className="flex h-24 items-end gap-1" aria-label="Emails sent per day">
          {history.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${dayShort(d.day)}: ${d.total} sent, ${d.campaign} from campaigns`}>
              <div className="flex w-full flex-col justify-end overflow-hidden rounded-sm bg-muted/40" style={{ height: `${Math.max(2, (d.total / peak) * 80)}px` }}>
                <div className="bg-primary/40" style={{ height: `${d.total > 0 ? (d.campaign / d.total) * 100 : 0}%` }} />
                <div className="flex-1 bg-primary" />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">{d.total}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{dayShort(history[0].day)}</span>
          <span>Darker = everyday email · lighter = campaigns</span>
          <span>{dayShort(history[history.length - 1].day)}</span>
        </div>
      </div>

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="lim-type">Email account type</Label>
          <select id="lim-type" className={SELECT_CLASS} value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value, dailyLimit: ACCOUNT_TYPES.find((t) => t.value === e.target.value)?.limit ?? form.dailyLimit })}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-daily">Daily limit</Label>
          <Input id="lim-daily" type="number" disabled={type?.limit !== null} value={type?.limit ?? form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-camp">Campaigns, most per day</Label>
          <Input id="lim-camp" type="number" min={1} value={form.campaignDailyMax} onChange={(e) => setForm({ ...form, campaignDailyMax: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-gap">Days between campaign emails to one person</Label>
          <Input id="lim-gap" type="number" min={0} value={form.minDaysBetween} onChange={(e) => setForm({ ...form, minDaysBetween: Number(e.target.value) })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Start small: a new sending pattern is safest when it grows gradually (say 50 to 100 a day for the first couple of weeks, then more). You get an alert in the CRM and by email when the account passes 70% of
        its limit, and campaigns wait automatically instead of going over.
      </p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await saveMarketingLimits({ ...form, dailyLimit: type?.limit ?? form.dailyLimit });
            if ("error" in r) toast.error(r.error);
            else {
              toast.success("Limits saved");
              router.refresh();
            }
          })
        }
      >
        Save limits
      </Button>
    </section>
  );
}

const AUTH_BADGE: Record<AuthCheck["status"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  ok: { label: "Good", variant: "success" },
  warn: { label: "Fine for now", variant: "warning" },
  bad: { label: "Needs fixing", variant: "destructive" },
};

function Authentication({ domain, checks }: { domain: string; checks: AuthCheck[] }) {
  const broken = checks.filter((c) => c.status === "bad").length;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="text-base font-semibold">Email authentication for {domain}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          These DNS records prove your emails really come from you. When they&apos;re wrong, Gmail and others send your mail to spam or block it. Checked live just now.
          {broken > 0 && <strong className="text-foreground"> Fix these before sending marketing email.</strong>}
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {checks.map((c) => (
          <li key={c.id} className="space-y-1.5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              <Badge variant={AUTH_BADGE[c.status].variant}>{AUTH_BADGE[c.status].label}</Badge>
            </div>
            <p className="text-sm">{c.detail}</p>
            {c.fix && <p className="text-sm text-muted-foreground">{c.fix}</p>}
            {c.suggested && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-muted px-2 py-1 text-xs">{c.suggested}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(c.suggested!).then(() => toast.success("Copied"))}>
                  Copy
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const HEALTH_BADGE: Record<Health["level"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  ok: { label: "Healthy", variant: "success" },
  watch: { label: "Watch", variant: "warning" },
  pause: { label: "Stopped", variant: "destructive" },
};

function CampaignMetrics({ campaigns }: { campaigns: CampaignView[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Campaign results</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A campaign stops by itself if {THRESHOLDS.bouncePause}% of its emails bounce, {THRESHOLDS.failPause}% can&apos;t be sent or {THRESHOLDS.unsubPause}% unsubscribe, and you get an alert. Opens
          aren&apos;t shown: mail apps hide them, so counts would be wrong. Clicks are counted. Bounces appear when you mark them (see below).
        </p>
      </div>
      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No campaigns yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Campaign</th>
                <th className="p-2 text-right">Sent</th>
                <th className="p-2 text-right">Clicked</th>
                <th className="p-2 text-right">Unsubscribed</th>
                <th className="p-2 text-right">Bounced</th>
                <th className="p-2 text-right">Couldn&apos;t send</th>
                <th className="p-2">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="p-2 align-top">
                    <div className="font-sans font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.status}
                      {c.stats.queued > 0 && ` · ${c.stats.queued} waiting`}
                      {c.lastRunAt && ` · last run ${when(c.lastRunAt)} ET`}
                    </div>
                  </td>
                  <td className="p-2 text-right align-top">{c.stats.sent}</td>
                  <td className="p-2 text-right align-top">
                    {c.stats.clicked} <span className="text-xs text-muted-foreground">{pct(c.stats.clicked, c.stats.sent)}</span>
                  </td>
                  <td className="p-2 text-right align-top">
                    {c.stats.unsubscribed} <span className="text-xs text-muted-foreground">{pct(c.stats.unsubscribed, c.stats.sent)}</span>
                  </td>
                  <td className="p-2 text-right align-top">
                    {c.stats.bounced} <span className="text-xs text-muted-foreground">{pct(c.stats.bounced, c.stats.sent)}</span>
                  </td>
                  <td className="p-2 text-right align-top">
                    {c.stats.failed} <span className="text-xs text-muted-foreground">{pct(c.stats.failed, c.stats.sent + c.stats.failed)}</span>
                  </td>
                  <td className="p-2 align-top font-sans">
                    <Badge variant={HEALTH_BADGE[c.health.level].variant}>{HEALTH_BADGE[c.health.level].label}</Badge>
                    {c.health.reasons.map((r) => (
                      <div key={r} className="mt-1 text-xs text-muted-foreground">
                        {r}
                      </div>
                    ))}
                    {c.pauseReason && c.status === "paused" && <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">Paused: {c.pauseReason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
  sent: { label: "Sent", variant: "success" },
  queued: { label: "Waiting", variant: "secondary" },
  sending: { label: "Sending", variant: "secondary" },
  failed: { label: "Couldn't send", variant: "destructive" },
  skipped: { label: "Skipped", variant: "outline" },
};

function MessageLog({ sends, others }: { sends: CampaignSendRow[]; others: OtherEmailRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"campaign" | "other">("campaign");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const campaignRows = useMemo(() => sends.filter((s) => !q || `${s.email} ${s.name ?? ""} ${s.campaignName}`.toLowerCase().includes(q)), [sends, q]);
  const otherRows = useMemo(() => others.filter((o) => !q || `${o.toEmail} ${o.subject} ${emailLogCategoryLabel(o.category)}`.toLowerCase().includes(q)), [others, q]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-base font-semibold">Every email</h2>
          <p className="text-sm text-muted-foreground">The most recent {kind === "campaign" ? "campaign emails" : "other emails the CRM sent"}, newest first.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(["campaign", "other"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn("rounded-full border px-3 py-1 text-sm", kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {k === "campaign" ? `Campaign emails (${sends.length})` : `Everything else (${others.length})`}
            </button>
          ))}
          <Input className="w-52" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        {kind === "campaign" ? (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Sent</th>
                <th className="p-2">To</th>
                <th className="p-2">Campaign</th>
                <th className="p-2">Result</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaignRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No campaign emails yet.
                  </td>
                </tr>
              )}
              {campaignRows.map((s) => {
                const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.queued;
                return (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap p-2 align-top text-muted-foreground">{when(s.sentAt ?? s.queuedAt)}</td>
                    <td className="p-2 align-top">
                      <div className="font-medium">{s.name || s.email}</div>
                      {s.name && <div className="text-xs text-muted-foreground">{s.email}</div>}
                    </td>
                    <td className="p-2 align-top">{s.campaignName}</td>
                    <td className="p-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {s.clicked && <Badge variant="outline">Clicked</Badge>}
                        {s.unsubscribed && <Badge variant="warning">Unsubscribed</Badge>}
                        {s.bounced && <Badge variant="destructive">Bounced</Badge>}
                      </div>
                      {s.error && <div className="mt-1 text-xs text-destructive">{s.error}</div>}
                    </td>
                    <td className="p-2 text-right align-top">
                      {s.status === "sent" && !s.bounced && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const r = await markBounced([s.email]);
                              if ("error" in r) toast.error(r.error);
                              else {
                                toast.success(`${s.email} won't be emailed again`);
                                router.refresh();
                              }
                            })
                          }
                        >
                          It bounced
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Sent</th>
                <th className="p-2">To</th>
                <th className="p-2">Subject</th>
                <th className="p-2">Kind</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {otherRows.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap p-2 align-top text-muted-foreground">{when(o.sentAt)}</td>
                  <td className="max-w-56 truncate p-2 align-top">{o.toEmail}</td>
                  <td className="max-w-80 truncate p-2 align-top">{o.subject}</td>
                  <td className="p-2 align-top">
                    <Badge variant="outline">{emailLogCategoryLabel(o.category)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="max-w-3xl space-y-1 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">About bounces</p>
        <p>
          Gmail doesn&apos;t tell the CRM when an email bounces; the &quot;Mail Delivery Subsystem&quot; notice lands in your inbox. When you see one, press <em>It bounced</em> on that row. That address is
          never emailed again, and the campaign&apos;s bounce rate updates and stops the campaign if it climbs. Check your inbox for those notices after each send.
        </p>
      </div>
    </section>
  );
}
