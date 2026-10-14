"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import {
  previewTransactionalLenderEmail,
  sendTransactionalLenderEmail,
  setTransactionalStage,
  updateTransactionalFee,
  updateTransactionalLoan,
} from "@/server/actions/transactional";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { StageReasonDialog } from "@/components/deals/stage-reason-dialog";
import { ArchiveTransactionalDialog } from "@/components/transactional/archive-transactional-dialog";
import { DeleteTransactionalDialog } from "@/components/transactional/delete-transactional-dialog";
import { RestoreTransactionalButton } from "@/components/transactional/restore-transactional-button";
import { ARCHIVABLE_STAGES } from "@/lib/deal-pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TRANSACTIONAL_STAGES, formatDay, formatMoney } from "@/lib/transactional-shared";
import { defaultBrokerPoints, formatPoints, transactionalFees } from "@/lib/transactional-fees";

export interface TransactionalLoanView {
  id: string;
  propertyAddress: string;
  fundingAmount: number;
  closingDate: string | null; // yyyy-mm-dd
  borrowerName: string | null;
  borrowerPhone: string | null;
  borrowerEmail: string | null;
  titleCompanyName: string | null;
  titleAgentName: string | null;
  titlePhone: string | null;
  titleEmail: string | null;
  sameDayFunding: boolean;
  marketingConsent: boolean;
  brokerPoints: number | null;
  stage: string;
  lostReason: string | null;
  transactionalLenderId: string | null;
  sentToLenderAt: string | null;
  archivedAt: string | null;
  archivedByName: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
}

export interface LenderOption {
  id: string;
  name: string;
}

function Tile({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col justify-center gap-0.5 rounded-md border bg-muted/30 px-3 py-2 ${className ?? ""}`}>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
      <p className="break-words text-base font-semibold">{value}</p>
      <div className="text-[10px] leading-tight text-muted-foreground">{hint || " "}</div>
    </div>
  );
}

function AdjustFee({ loan }: { loan: TransactionalLoanView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(loan.brokerPoints === null ? "" : String(loan.brokerPoints));
  const [sameDay, setSameDay] = useState(loan.sameDayFunding);
  const [pending, startTransition] = useTransition();
  const standard = defaultBrokerPoints(loan.fundingAmount);

  function save() {
    startTransition(async () => {
      try {
        await updateTransactionalFee(loan.id, points, sameDay);
        toast.success("Fee updated");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPoints(loan.brokerPoints === null ? "" : String(loan.brokerPoints));
          setSameDay(loan.sameDayFunding);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Adjust broker fee
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="broker-points">Broker points (%)</Label>
          <Input
            id="broker-points"
            type="number"
            step="0.01"
            placeholder={String(standard)}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Standard for this size is {formatPoints(standard)}. Leave blank to use it.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sameDay} onCheckedChange={(v) => setSameDay(v === true)} />
          Same-day funding (+0.25%)
        </label>
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function SendToLenderDialog({ loan, lenders }: { loan: TransactionalLoanView; lenders: LenderOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  // Pick who to send it to: the one already on this request, or the only
  // lender there is; otherwise it starts empty.
  const initialLenderId = loan.transactionalLenderId ?? (lenders.length === 1 ? lenders[0].id : "");
  const [lenderId, setLenderId] = useState(initialLenderId);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadPreview(forLenderId: string) {
    setError(null);
    if (!forLenderId) {
      setTo("");
      setSubject("");
      setBody("");
      return;
    }
    setLoading(true);
    try {
      const preview = await previewTransactionalLenderEmail(loan.id, forLenderId);
      setTo(preview.to);
      setSubject(preview.subject);
      setBody(preview.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build this email.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLenderId(initialLenderId);
    void loadPreview(initialLenderId);
  }

  function handleLenderChange(next: string) {
    setLenderId(next);
    void loadPreview(next);
  }

  function handleSend() {
    setError(null);
    startSend(async () => {
      try {
        await sendTransactionalLenderEmail(loan.id, lenderId, to, subject, body);
        toast.success("Sent to the lender");
        setOpen(false);
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
        <Button type="button" size="sm">
          <Mail className="size-3.5" />
          Email lender
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email the transactional lender</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lender-pick">Lender</Label>
            <Select value={lenderId} onValueChange={handleLenderChange}>
              <SelectTrigger id="lender-pick" className="w-full">
                <SelectValue placeholder={lenders.length ? "Choose a lender" : "No transactional lenders yet"} />
              </SelectTrigger>
              <SelectContent>
                {lenders.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lenders.length === 0 && (
              <p className="text-xs text-muted-foreground">Add one under Lenders → Transactional first.</p>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error && !subject ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : lenderId ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="lender-to">To</Label>
                <Input id="lender-to" value={to} onChange={(e) => setTo(e.target.value)} />
                {to.includes(",") && (
                  <p className="text-xs text-muted-foreground">Goes to every contact at this lender.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lender-subject">Subject</Label>
                <Input id="lender-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lender-body">Message — edit anything before sending</Label>
                <Textarea id="lender-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Your signature is added when it sends. Sending makes this the request&apos;s lender, and a new request
                moves to Sent to Lender.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="button" className="w-full" disabled={sending} onClick={handleSend}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditDetailsDialog({ loan }: { loan: TransactionalLoanView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const save = updateTransactionalLoan.bind(null, loan.id);

  const field = (id: string, label: string, value: string | null, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`edit-${id}`}>{label}</Label>
      <Input id={`edit-${id}`} name={id} type={type} defaultValue={value ?? ""} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit request</DialogTitle>
        </DialogHeader>
        <ActionForm
          action={save}
          successMessage="Saved"
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("propertyAddress", "Property address", loan.propertyAddress)}</div>
            {field("fundingAmount", "Funding amount", String(loan.fundingAmount), "number")}
            {field("closingDate", "Closing date", loan.closingDate, "date")}
            {field("borrowerName", "Borrower name", loan.borrowerName)}
            {field("borrowerPhone", "Borrower phone", loan.borrowerPhone)}
            {field("borrowerEmail", "Borrower email", loan.borrowerEmail, "email")}
            {field("titleCompanyName", "Title company", loan.titleCompanyName)}
            {field("titleAgentName", "Title agent", loan.titleAgentName)}
            {field("titlePhone", "Title phone", loan.titlePhone)}
            {field("titleEmail", "Title email", loan.titleEmail, "email")}
            {field("brokerPoints", "Broker points (%) — blank for standard", loan.brokerPoints === null ? "" : String(loan.brokerPoints), "number")}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="sameDayFunding" defaultChecked={loan.sameDayFunding} />
            Same-day funding
          </label>
          <SubmitButton className="w-full">Save</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function TransactionalDetail({
  loan,
  lenders,
  lenderName,
  isAdmin,
}: {
  loan: TransactionalLoanView;
  lenders: LenderOption[];
  lenderName: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const fees = transactionalFees({
    fundingAmount: loan.fundingAmount,
    brokerPoints: loan.brokerPoints,
    sameDayFunding: loan.sameDayFunding,
  });

  function changeStage(stage: string, reason?: string) {
    startTransition(async () => {
      try {
        await setTransactionalStage(loan.id, stage, reason);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't change the stage");
      }
    });
  }

  return (
    <div className="space-y-4">
      {loan.deletedAt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">
            This request was deleted on {formatDay(loan.deletedAt.slice(0, 10))}
            {loan.deletedByName ? ` by ${loan.deletedByName}` : ""}. Only admins can see it. It will be permanently removed
            30 days after deletion.
          </p>
          {isAdmin && <RestoreTransactionalButton loanId={loan.id} kind="deleted" variant="destructive" />}
        </div>
      )}
      {!loan.deletedAt && loan.archivedAt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <p>
            Archived on {formatDay(loan.archivedAt.slice(0, 10))}
            {loan.archivedByName ? ` by ${loan.archivedByName}` : " automatically"}. It is off the board but fully on
            file.
          </p>
          <RestoreTransactionalButton loanId={loan.id} kind="archived" />
        </div>
      )}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{loan.propertyAddress}</h1>
            <p className="text-xs text-muted-foreground">
              Double close
              {loan.sentToLenderAt
                ? ` · Sent to ${lenderName ?? "the lender"} on ${formatDay(loan.sentToLenderAt.slice(0, 10))}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={loan.stage}
              disabled={pending}
              onValueChange={(v) => (v === "lost" ? setLostOpen(true) : changeStage(v))}
            >
              <SelectTrigger className="w-44" aria-label="Stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTIONAL_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SendToLenderDialog loan={loan} lenders={lenders} />
          </div>
        </div>

        {loan.stage === "lost" && loan.lostReason && (
          <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">Lost: {loan.lostReason}</p>
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label="Property address" value={loan.propertyAddress} className="col-span-2 md:col-span-1" />
          <Tile label="Funding amount" value={formatMoney(loan.fundingAmount)} />
          <Tile
            label="Closing date"
            value={formatDay(loan.closingDate)}
            hint={loan.sameDayFunding ? <Badge variant="warning" className="text-[10px]">Same-day funding</Badge> : undefined}
          />
          <Tile
            label="Total fee charged"
            value={formatMoney(fees.totalFee)}
            hint={`${formatPoints(fees.totalPoints)} incl. ${formatPoints(fees.lenderPoints)} (${formatMoney(fees.lenderFee)}) to the lender`}
          />
          <Tile
            label="Broker fee"
            value={formatMoney(fees.brokerFee)}
            hint={
              <>
                {formatPoints(fees.brokerTotalPoints)}
                {fees.premiumPoints > 0 ? ` (${formatPoints(fees.brokerBasePoints)} + ${formatPoints(fees.premiumPoints)} same-day)` : ""}
                {fees.isCustomPoints ? " · adjusted" : ""}
              </>
            }
          />
          <Tile label="Borrower" value={loan.borrowerName ?? "—"} hint={[loan.borrowerPhone, loan.borrowerEmail, loan.marketingConsent ? "Consented to emails/texts" : "No marketing consent"].filter(Boolean).join(" · ")} className="col-span-2" />
          {loan.sentToLenderAt && (
            <Tile
              label="Lender"
              value={lenderName ?? "—"}
              hint={`Emailed ${formatDay(loan.sentToLenderAt.slice(0, 10))}`}
              className="col-span-2 md:col-span-1"
            />
          )}
        </div>

        {fees.outsideStandardRange && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            This amount is outside the standard $100,000–$1,000,000 pricing, so the points shown are the nearest standard
            tier. Use Adjust broker fee to set your own.
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title company</p>
            <p>{loan.titleCompanyName ?? "—"}</p>
            <p className="text-muted-foreground">
              {[loan.titleAgentName, loan.titlePhone, loan.titleEmail].filter(Boolean).join(" · ") || "No agent details"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <AdjustFee loan={loan} />
            <EditDetailsDialog loan={loan} />
            {ARCHIVABLE_STAGES.has(loan.stage) && !loan.archivedAt && (
              <ArchiveTransactionalDialog
                loanId={loan.id}
                propertyAddress={loan.propertyAddress}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    Archive
                  </Button>
                }
              />
            )}
            <DeleteTransactionalDialog
              loanId={loan.id}
              propertyAddress={loan.propertyAddress}
              onDeleted={() => router.push("/pipeline/transactional")}
              trigger={
                <Button type="button" variant="ghost" size="sm" className="text-destructive">
                  Delete
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <StageReasonDialog
        stage="lost"
        open={lostOpen}
        onOpenChange={setLostOpen}
        onConfirm={(reason) => {
          setLostOpen(false);
          changeStage("lost", reason);
        }}
      />
    </div>
  );
}
