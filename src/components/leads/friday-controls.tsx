"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { checkZoom, copyMonthlyList, testZoomRegistrationAction, markFridayAttendance, runFridayJobsNow, syncFridayAttendanceNow } from "@/server/actions/friday";
import { isActionError } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run(fn: () => Promise<unknown>, success: (result: never) => string) {
      start(async () => {
        try {
          const result = await fn();
          if (isActionError(result)) {
            toast.error(result.error);
            return;
          }
          toast.success(success(result as never));
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Something went wrong.");
        }
      });
    },
  };
}

export function AttendanceButtons({ leadId, status }: { leadId: string; status: string | null }) {
  const { run, pending } = useRun();
  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant={status === "attended" ? "default" : "outline"} disabled={pending} onClick={() => run(() => markFridayAttendance(leadId, "attended"), () => "Marked attended")}>
        Attended
      </Button>
      <Button type="button" size="sm" variant={status === "no_show" ? "default" : "outline"} disabled={pending} onClick={() => run(() => markFridayAttendance(leadId, "no_show"), () => "Marked no-show")}>
        No-show
      </Button>
    </div>
  );
}

export function SyncButton({ day }: { day: string }) {
  const { run, pending } = useRun();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => run(() => syncFridayAttendanceNow(day), (r: { present: number; absent: number }) => `Synced from Zoom: ${r.present} attended, ${r.absent} no-show`)}
    >
      {pending ? "Syncing…" : "Sync attendance from Zoom"}
    </Button>
  );
}

export function RunJobsButton() {
  const { run, pending } = useRun();
  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => runFridayJobsNow(), (r: Record<string, unknown>) => `Ran: ${JSON.stringify(r)}`)}>
      Run the scheduled checks now
    </Button>
  );
}

export function CopyMonthlyListButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending || count === 0}
      onClick={() =>
        start(async () => {
          const emails = await copyMonthlyList();
          await navigator.clipboard.writeText(emails.join(", "));
          toast.success(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"}`);
        })
      }
    >
      Copy monthly list ({count})
    </Button>
  );
}

export function CheckZoomButton() {
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<{ label: string; ok: boolean; detail: string }[] | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setChecks(await checkZoom());
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't run the check.");
            }
          })
        }
      >
        {pending ? "Checking…" : "Check Zoom connection"}
      </Button>
      {checks && (
        <ul className="space-y-1 rounded-md border p-3 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-2">
              <span aria-hidden="true">{c.ok ? "✓" : "✗"}</span>
              <span>
                <span className="font-medium">{c.label}.</span> <span className={c.ok ? "text-muted-foreground" : "text-destructive"}>{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TestRegistrationBox() {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Test a Zoom registration</p>
      <p className="text-xs text-muted-foreground">Registers this email for the Friday meeting and shows Zoom&apos;s exact answer. If it works it creates a real registrant in Zoom, so delete it there afterward.</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you+test@example.com"
          className="h-8 w-64 rounded-md border bg-background px-2 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !email}
          onClick={() =>
            start(async () => {
              const r = await testZoomRegistrationAction(email);
              if ("error" in r) setResult(r.error);
              else if (r.ok) setResult(`Worked. Zoom gave this join link: ${r.joinUrl}`);
              else setResult(`Zoom said: ${r.error}`);
            })
          }
        >
          {pending ? "Testing…" : "Test registration"}
        </Button>
      </div>
      {result && <p className="break-words text-sm">{result}</p>}
    </div>
  );
}
