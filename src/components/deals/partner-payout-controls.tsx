"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignDealPartner, markBrokerFeeReceivedAction, markPayoutPaidAction } from "@/server/actions/partners";
import { isActionError } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The broker fee arrived (wire or mailed check). Prefilled with today and the fee the approved terms imply. */
export function FeeReceivedButton({ dealId, suggestedAmount }: { dealId: string; suggestedAmount: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(suggestedAmount ? String(suggestedAmount) : "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("date", date);
        formData.set("amount", amount);
        const result = await markBrokerFeeReceivedAction(dealId, formData);
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("Broker fee marked received");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save that.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="bg-white">
          Mark broker fee received
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Broker fee received</DialogTitle>
          <DialogDescription>
            When our fee actually lands (wire or mailed check), the partner&apos;s payout is calculated from what was collected and can be released.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fee-date">Date received</Label>
            <Input id="fee-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee-amount">Broker fee collected ($)</Label>
            <Input id="fee-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button type="button" className="w-full" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One click in the common case: date and amount come prefilled; edit either only if you paid differently. */
export function MarkPaidControl({ payoutId, amount, compact }: { payoutId: string; amount: number; compact?: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [paid, setPaid] = useState(amount.toFixed(2));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("date", date);
        formData.set("amount", paid);
        const result = await markPayoutPaidAction(payoutId, formData);
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("Marked paid — the partner was emailed");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't mark this paid.");
      }
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "bg-white"}`}>
      <Input aria-label="Date paid" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-36 text-xs" />
      <Input aria-label="Amount paid" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} className="h-8 w-28 text-xs" />
      <Button type="button" size="sm" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Mark paid"}
      </Button>
    </div>
  );
}

/** Admin-only: attribute (or re-attribute) a deal to a partner; the only way a referral's partner ever changes. */
type AssignPartnerProps = {
  dealId: string;
  currentPartnerId: string | null;
  partners: { id: string; label: string }[];
};

function AssignPartnerDialog({
  dealId,
  currentPartnerId,
  partners,
  trigger,
}: AssignPartnerProps & { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentPartnerId ?? "none");
  const [notify, setNotify] = useState(true);
  const [pending, startTransition] = useTransition();
  const isNewPartner = value !== "none" && value !== currentPartnerId;

  function save() {
    startTransition(async () => {
      try {
        const result = await assignDealPartner(dealId, value === "none" ? null : value, isNewPartner && notify);
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success(isNewPartner && notify ? "Referring partner updated and notified" : "Referring partner updated");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update the partner.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(currentPartnerId ?? "none");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Referring partner</DialogTitle>
          <DialogDescription>
            Who gets credit for this deal. It shows up in their portal right away at the stage it&apos;s in now. Changing it later moves the referral (and any unpaid payout) to the new partner and is logged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="w-full" aria-label="Referring partner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No partner</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isNewPartner && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={notify} onCheckedChange={(c) => setNotify(c === true)} className="mt-0.5" />
              <span>Let the partner know by email that this referral was added to their account</span>
            </label>
          )}
          <Button type="button" className="w-full" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssignPartnerMenuItem(props: AssignPartnerProps) {
  return <AssignPartnerDialog {...props} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Referring partner…</DropdownMenuItem>} />;
}

/** Overview-screen card: who referred this deal, with a one-click way to credit (or re-credit) a partner. */
export function ReferringPartnerCard(props: AssignPartnerProps) {
  const current = props.partners.find((p) => p.id === props.currentPartnerId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
      <div className="min-w-0 text-sm">
        <span className="text-muted-foreground">Referred by: </span>
        <span className="font-medium">{current ? current.label : props.currentPartnerId ? "A partner no longer in the program" : "No referral partner"}</span>
      </div>
      <AssignPartnerDialog
        {...props}
        trigger={
          <Button type="button" variant="outline" size="sm">
            {props.currentPartnerId ? "Change partner" : "Assign to a partner"}
          </Button>
        }
      />
    </div>
  );
}
