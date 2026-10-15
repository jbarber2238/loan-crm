"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignDealPartner, markBrokerFeeReceivedAction, markPayoutPaidAction } from "@/server/actions/partners";
import { Button } from "@/components/ui/button";
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
        await markBrokerFeeReceivedAction(dealId, formData);
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
        await markPayoutPaidAction(payoutId, formData);
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
export function AssignPartnerMenuItem({
  dealId,
  currentPartnerId,
  partners,
}: {
  dealId: string;
  currentPartnerId: string | null;
  partners: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentPartnerId ?? "none");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await assignDealPartner(dealId, value === "none" ? null : value);
        toast.success("Referring partner updated");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update the partner.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Referring partner…</DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Referring partner</DialogTitle>
          <DialogDescription>
            Who gets credit for this deal. Changing it moves the referral (and any unpaid payout) to the new partner and is logged.
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
          <Button type="button" className="w-full" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
