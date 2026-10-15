"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deletePartner,
  invitePartner,
  migrateLegacyPartners,
  resendPartnerInvite,
  revealPartnerBanking,
  setPartnerStatus,
  setPartnerTier,
  setProgramLive,
} from "@/server/actions/partners";
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
        await fn();
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

export function MigrateLegacyButton({ count, live }: { count: number; live: boolean }) {
  const { run, pending } = useRun();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p>
        {count} existing affiliate{count === 1 ? "" : "s"} from before the portal. Migrating emails each one a link to set a
        password and accept the terms. Their old referral links keep working.
        {!live && " (Turn the program live first.)"}
      </p>
      <Button type="button" size="sm" disabled={pending || !live} onClick={() => setConfirm(true)}>
        Migrate &amp; send invites
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Migrate existing affiliates?"
        message={`This sends ${count} email${count === 1 ? "" : "s"} right now.`}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          run(() => migrateLegacyPartners(), "Invites sent");
        }}
      />
    </div>
  );
}

export function PartnerActions({
  partnerId,
  status,
  tier,
  name,
}: {
  partnerId: string;
  status: string;
  tier: number;
  name: string;
}) {
  const { run, pending } = useRun();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const invited = status === "invited" || status === "profile_complete";
  const activeish = status === "active" || status === "paused";
  return (
    <div className="flex flex-wrap items-center gap-2">
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
            setDetails(await revealPartnerBanking(partnerId));
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
