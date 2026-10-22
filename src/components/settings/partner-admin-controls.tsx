"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deletePartner,
  invitePartner,
  migrateLegacyPartner,
  resendPartnerInvite,
  savePartnerInviteSettings,
  revealPartnerBanking,
  setPartnerStatus,
  setPartnerTier,
  setProgramLive,
} from "@/server/actions/partners";
import { isActionError } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong — try again.");
      }
    });
  }
  return { run, pending };
}

export function ProgramLiveSwitch({ live }: { live: boolean }) {
  const { run, pending } = useRun();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <p className="font-medium">Partner program {live ? "is live" : "is off"}</p>
        <p className="text-muted-foreground">
          {live
            ? "Partners get every email (invites, stage updates, payment requests, paid confirmations)."
            : "Test mode: partner emails only go to staff addresses, so you can try everything with your own email first."}
        </p>
      </div>
      <Button
        type="button"
        variant={live ? "outline" : "default"}
        disabled={pending}
        onClick={() => (live ? run(() => setProgramLive(false), "Program switched off") : setConfirm(true))}
      >
        {live ? "Switch off" : "Go live"}
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Go live?"
        message="From now on partners will receive real emails — invites, stage updates and payment requests."
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run(() => setProgramLive(true), "Partner program is live");
        }}
      />
    </div>
  );
}

export function InvitePartnerForm() {
  const { run, pending } = useRun();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="flex flex-wrap items-end gap-3"
      action={(formData) => {
        run(async () => {
          const res = await invitePartner(formData);
          if (isActionError(res)) return res;
          formRef.current?.reset();
          if (!res.sent) toast.message("Invite created, but the email wasn't sent (program is off and that isn't a staff address).");
        }, "Invite created");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="partner-email">Email</Label>
        <Input id="partner-email" name="email" type="email" required placeholder="partner@example.com" className="w-64" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partner-name">Name (optional)</Label>
        <Input id="partner-name" name="name" placeholder="Jane Smith" className="w-48" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite partner"}
      </Button>
    </form>
  );
}

export function MigrateLegacyNotice({ count }: { count: number }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {count} existing affiliate{count === 1 ? "" : "s"} from before the portal. Migrate each one from its own card below when
      you&apos;re ready: that emails them a link to set a password and accept the terms. Their old referral links keep working.
    </div>
  );
}

export function PartnerActions({
  partnerId,
  status,
  tier,
  name,
  live,
}: {
  partnerId: string;
  status: string;
  tier: number;
  name: string;
  live: boolean;
}) {
  const { run, pending } = useRun();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMigrate, setConfirmMigrate] = useState(false);
  const invited = status === "invited" || status === "profile_complete";
  const activeish = status === "active" || status === "paused";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "legacy" && (
        <>
          <Button type="button" size="sm" disabled={pending || !live} title={live ? undefined : "Turn the program live first"} onClick={() => setConfirmMigrate(true)}>
            Migrate &amp; send invite
          </Button>
          <ConfirmDialog
            open={confirmMigrate}
            title={`Migrate ${name}?`}
            message={`This emails ${name} a link to set a password and accept the terms, right now.`}
            onCancel={() => setConfirmMigrate(false)}
            onConfirm={() => {
              setConfirmMigrate(false);
              run(() => migrateLegacyPartner(partnerId), "Invite sent");
            }}
          />
        </>
      )}
      {invited && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendPartnerInvite(partnerId), "Invite re-sent")}>
          Resend invite
        </Button>
      )}
      {activeish && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => setPartnerStatus(partnerId, status === "paused" ? "active" : "paused"), status === "paused" ? "Resumed" : "Paused")}
          >
            {status === "paused" ? "Resume" : "Pause"}
          </Button>
          <select
            aria-label="Partner tier"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={tier}
            disabled={pending}
            onChange={(e) => run(() => setPartnerTier(partnerId, Number(e.target.value) as 20 | 25), "Tier updated")}
          >
            <option value={20}>20% tier</option>
            <option value={25}>25% tier</option>
          </select>
        </>
      )}
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${name}?`}
        message="This can't be undone. If they've referred deals or have payouts, removal is blocked — pause them instead."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          run(() => deletePartner(partnerId), "Removed");
        }}
      />
    </div>
  );
}

/** Shows full banking details after an explicit, logged click; hides itself after 60 seconds. */
export function RevealBanking({ partnerId, last4 }: { partnerId: string; last4: string | null }) {
  const [details, setDetails] = useState<{ accountHolder: string; routing: string; account: string; accountType: string } | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!details) return;
    const t = setTimeout(() => setDetails(null), 60_000);
    return () => clearTimeout(t);
  }, [details]);

  if (details) {
    return (
      <div className="rounded-md border bg-muted/40 p-2 text-xs">
        <p>
          {details.accountHolder} · {details.accountType} · routing <span className="font-mono">{details.routing}</span> · account{" "}
          <span className="font-mono">{details.account}</span>
        </p>
        <p className="text-muted-foreground">Hides in 60 seconds. This view was logged.</p>
      </div>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await revealPartnerBanking(partnerId);
            if (isActionError(res)) toast.error(res.error);
            else setDetails(res);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't reveal.");
          }
        })
      }
    >
      Reveal account ····{last4 ?? ""}
    </Button>
  );
}

export function InviteReminderSettings({ reminderDays, expiresDays }: { reminderDays: string; expiresDays: number }) {
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
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
        <Label htmlFor="reminderDays">Send reminders on days</Label>
        <Input id="reminderDays" name="reminderDays" defaultValue={reminderDays} placeholder="2, 5, 9, 14" className="w-44" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expiresDays">Invite expires after (days)</Label>
        <Input id="expiresDays" name="expiresDays" type="number" min={1} defaultValue={expiresDays} className="w-36" />
      </div>
      <Button type="submit" variant="outline">
        Save
      </Button>
      <p className="basis-full text-xs text-muted-foreground">
        Days count from when the invite was sent, and the last reminder goes out as the link nears expiry. Edit the wording under Settings → Email Templates → Partner Invites &amp; Reminders. Leave the days blank for no reminders.
      </p>
    </form>
  );
}
