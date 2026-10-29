"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteCampaign, pauseCampaign, resumeCampaign } from "@/server/actions/marketing-campaigns";
import { describeSchedule, parseSchedule } from "@/lib/campaign-schedule";
import type { CampaignStats } from "@/server/marketing-campaigns";

export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  status: string;
  schedule: unknown;
  audienceLabel: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  stats: CampaignStats;
}

const STATUS: Record<string, { label: string; variant: "secondary" | "success" | "warning" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  active: { label: "Live", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  completed: { label: "Finished", variant: "outline" },
};

const when = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { error: string }>, success: string) =>
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(success);
        router.refresh();
      }
    });

  if (campaigns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No campaigns yet. Describe one in the{" "}
        <Link href="/marketing" className="underline">
          Email Builder
        </Link>{" "}
        and I&apos;ll set it up.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {campaigns.map((c) => {
        const status = STATUS[c.status] ?? STATUS.draft;
        const schedule = parseSchedule(c.schedule);
        const { stats } = c;
        return (
          <li key={c.id} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/marketing?c=${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              <Badge variant={status.variant}>{status.label}</Badge>
              <div className="ml-auto flex gap-1">
                <Link href={`/marketing?c=${c.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  Open
                </Link>
                {c.status === "active" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseCampaign(c.id), "Paused")}>
                    Pause
                  </Button>
                )}
                {c.status === "paused" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resumeCampaign(c.id), "Resumed")}>
                    Resume
                  </Button>
                )}
                {c.status !== "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete “${c.name}”? Its send history goes with it.`)) run(() => deleteCampaign(c.id), "Deleted");
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              “{c.subject || "No subject yet"}” to {c.audienceLabel}
            </p>
            <p className="text-sm text-muted-foreground">
              {schedule ? describeSchedule(schedule) : "Not scheduled"}
              {c.status === "active" && c.nextRunAt && ` · next send ${when(c.nextRunAt)} ET`}
              {c.lastRunAt && ` · last run ${when(c.lastRunAt)} ET`}
            </p>
            {(stats.sent > 0 || stats.queued > 0 || stats.failed > 0) && (
              <p className="text-sm tabular-nums">
                <strong>{stats.sent}</strong> sent · <strong>{stats.clicked}</strong> clicked
                {stats.queued > 0 && ` · ${stats.queued} waiting to send`}
                {stats.skipped > 0 && ` · ${stats.skipped} skipped (no longer on the list)`}
                {stats.failed > 0 && <span className="text-destructive"> · {stats.failed} failed</span>}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
