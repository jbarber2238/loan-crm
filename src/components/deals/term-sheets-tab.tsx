"use client";

import { useRef, useState, useTransition, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cloneTermSheet,
  generateTermSheet,
  previewBookACallEmail,
  previewTermSheetsToBorrowerEmail,
  sendBookACallEmail,
  sendTermSheetForSignature,
  sendTermSheetsToBorrowerEmail,
  updateTermSheetFields,
} from "@/server/actions/term-sheets";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NewTermSheetForm } from "@/components/deals/new-term-sheet-form";
import { TermSheetFieldInputs } from "@/components/deals/term-sheet-field-inputs";
import { RecipientLine } from "@/components/emails/recipient-line";
import { SignaturePreview } from "@/components/emails/signature-preview";
import { HtmlBodyEditor } from "@/components/emails/html-body-editor";
import type { RecipientCandidate } from "@/lib/email-recipients";
import { ADMIN_ONLY_FIELDS, termSheetFieldsFor } from "@/lib/term-sheet-fields";
import { valueBasisFor, calculateLtv } from "@/lib/term-sheet-calculations";
import { isInterestOnlyCategory } from "@/lib/loan-sections";

interface TermSheet {
  id: string;
  status: "draft" | "generated" | "accepted" | "superseded";
  fields: Record<string, unknown>;
  pdfUrl: string | null;
  createdAt: Date;
  pandadocStatus: string | null;
  sentForReviewAt: Date | null;
  lender: { name: string };
  product: { name: string; category: string };
}

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderName: string;
}

type StatusBadgeVariant = "default" | "secondary" | "destructive" | "warning" | "outline";

const PENDING_SIGNATURE_PANDADOC_STATUSES = new Set([
  "document.sent",
  "document.viewed",
  "document.waiting_approval",
  "document.waiting_pay",
]);

// One clear badge per term sheet instead of two overlapping ones — "sent for
// review" (a plain informational email, see SendTermSheetsDialog) and "sent
// for e-signature" (PandaDoc, sendTermSheetForSignature) are two different
// things and shouldn't both just read "Sent".
function termSheetDisplayStatus(termSheet: TermSheet): { label: string; variant: StatusBadgeVariant } {
  if (termSheet.status === "accepted") return { label: "Accepted", variant: "default" };
  if (termSheet.status === "superseded") return { label: "Opted out", variant: "outline" };
  if (termSheet.pandadocStatus === "document.declined") return { label: "Declined", variant: "destructive" };
  if (termSheet.pandadocStatus === "document.voided") return { label: "Voided", variant: "outline" };
  if (termSheet.pandadocStatus && PENDING_SIGNATURE_PANDADOC_STATUSES.has(termSheet.pandadocStatus)) {
    return { label: "Pending Signature", variant: "warning" };
  }
  if (termSheet.sentForReviewAt) return { label: "Sent for Review", variant: "secondary" };
  if (termSheet.status === "generated") return { label: "Generated", variant: "secondary" };
  return { label: "Draft", variant: "outline" };
}

function numField(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key];
  const n = Number(value);
  return typeof value !== "undefined" && value !== null && value !== "" && Number.isFinite(n) ? n : null;
}

function textField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// amortizationType is freeform ("30 Year Fixed", "5/6 ARM, ..."), and it's
// the only place an ARM designation is captured — so when it mentions ARM,
// that text *is* the type to show. Otherwise build a plain "{n}-year/month
// term" from the structured term field. Same convention as the term-sheet
// button label in the borrower "ready" email, so a rate/term/LTV summary
// reads the same wherever it shows up.
function loanTypeSummary(category: string, fields: Record<string, unknown>): string | null {
  const amortizationType = textField(fields, "amortizationType");
  if (amortizationType && /arm/i.test(amortizationType)) return amortizationType;
  const isMonths = isInterestOnlyCategory(category);
  const term = numField(fields, isMonths ? "loanTermMonths" : "loanTermYears");
  if (term !== null) return `${Math.round(term)}-${isMonths ? "month" : "year"} term`;
  return amortizationType;
}

// A quick "which one is this" preview for the card title — rate, term
// type, and LTV in one glance, so picking the right one to send stays easy
// once a deal has several term sheets on file.
function termSheetSummary(
  category: string,
  fields: Record<string, unknown>,
  purchasePrice: number | null,
  estimatedAsIsValue: number | null
): string | null {
  const rate = numField(fields, "interestRate");
  const loanAmount = numField(fields, "loanAmount");
  const valueBasis = valueBasisFor(category, purchasePrice, estimatedAsIsValue);
  const ltv = loanAmount !== null ? calculateLtv(loanAmount, valueBasis) : null;
  const typeLabel = loanTypeSummary(category, fields);

  const parts = [
    rate !== null ? `${Number(rate.toFixed(2))}%` : null,
    typeLabel,
    ltv !== null ? `${Number(ltv.toFixed(1))}% LTV` : null,
  ].filter((p): p is string => Boolean(p));

  return parts.length ? parts.join(", ") : null;
}

interface EmailComposeState {
  to: string;
  cc: string;
  subject: string;
  body: string;
  signatureHtml: string;
  candidates: RecipientCandidate[];
}

// Shared compose view for both borrower email flows below — To/Cc/Subject/
// Body, all editable, plus the sending user's real signature shown before
// the Send click, matching every other email dialog in the app. The body is
// edited in place via HtmlBodyEditor; the caller reads bodyRef.current.innerHTML
// at send time rather than tracking it through compose state.
function ComposeFields({
  idPrefix,
  compose,
  setCompose,
  bodyRef,
}: {
  idPrefix: string;
  compose: EmailComposeState;
  setCompose: Dispatch<SetStateAction<EmailComposeState | null>>;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <RecipientLine
          id={`${idPrefix}-to`}
          label="To"
          value={compose.to}
          onChange={(v) => setCompose((p) => (p ? { ...p, to: v } : p))}
          candidates={compose.candidates}
        />
        <RecipientLine
          id={`${idPrefix}-cc`}
          label="Cc"
          value={compose.cc}
          onChange={(v) => setCompose((p) => (p ? { ...p, cc: v } : p))}
          candidates={compose.candidates}
        />
      </div>
      <Input
        value={compose.subject}
        onChange={(e) => setCompose((p) => (p ? { ...p, subject: e.target.value } : p))}
      />
      <div className="space-y-1.5">
        <Label>Email preview — click any text below to edit it</Label>
        <HtmlBodyEditor html={compose.body} bodyRef={bodyRef} />
      </div>
      <SignaturePreview html={compose.signatureHtml} />
    </div>
  );
}

function SendTermSheetsDialog({
  dealId,
  shareable,
  hasBorrowerEmail,
  sentAt,
}: {
  dealId: string;
  shareable: TermSheet[];
  hasBorrowerEmail: boolean;
  sentAt?: Date | null;
}) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "compose">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<EmailComposeState | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setStep("select");
    setError(null);
    setSelectedIds(new Set(shareable.map((t) => t.id)));
  }

  function handlePreview() {
    setError(null);
    setLoading(true);
    previewTermSheetsToBorrowerEmail(dealId, Array.from(selectedIds))
      .then((preview) => {
        setCompose(preview);
        setStep("compose");
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Couldn't build this email.";
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }

  function handleSend() {
    if (!compose) return;
    setError(null);
    const finalBody = bodyRef.current?.innerHTML ?? compose.body;
    startSend(async () => {
      try {
        await sendTermSheetsToBorrowerEmail(
          dealId,
          Array.from(selectedIds),
          compose.to,
          compose.cc,
          compose.subject,
          finalBody
        );
        setOpen(false);
        toast.success("Term sheets sent");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send this email.";
        setError(message);
        toast.error(message);
      }
    });
  }

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline">Send to borrower</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Send term sheets to borrower</DialogTitle>
          </DialogHeader>
        {!hasBorrowerEmail ? (
          <p className="text-sm text-muted-foreground">Add a borrower email on the Overview tab first.</p>
        ) : step === "select" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {shareable.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={(v) => toggle(t.id, v === true)} />
                  {t.lender.name} — {t.product.name}
                </label>
              ))}
              {shareable.length === 0 && (
                <p className="text-sm text-muted-foreground">Generate a term sheet first.</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={selectedIds.size === 0 || loading} onClick={handlePreview}>
              {loading ? "Building…" : "Preview email"}
            </Button>
          </div>
        ) : compose ? (
          <div className="space-y-3">
            <ComposeFields idPrefix="send-term-sheets" compose={compose} setCompose={setCompose} bodyRef={bodyRef} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button type="button" className="flex-1" disabled={sending} onClick={handleSend}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        ) : null}
        </DialogContent>
      </Dialog>
      {sentAt && (
        <p className="text-xs text-muted-foreground">
          ✓ Sent {sentAt.toLocaleDateString()} at {sentAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

function BookACallDialog({
  dealId,
  hasBorrowerEmail,
  sentAt,
}: {
  dealId: string;
  hasBorrowerEmail: boolean;
  sentAt?: Date | null;
}) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<EmailComposeState | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next || !hasBorrowerEmail) return;
    setError(null);
    setLoading(true);
    previewBookACallEmail(dealId)
      .then(setCompose)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't build this email."))
      .finally(() => setLoading(false));
  }

  function handleSend() {
    if (!compose) return;
    setError(null);
    const finalBody = bodyRef.current?.innerHTML ?? compose.body;
    startSend(async () => {
      try {
        await sendBookACallEmail(dealId, compose.to, compose.cc, compose.subject, finalBody);
        setOpen(false);
        toast.success("Email sent");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send this email.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline">Send &ldquo;book a call&rdquo; email</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Book a call</DialogTitle>
          </DialogHeader>
          {!hasBorrowerEmail ? (
            <p className="text-sm text-muted-foreground">Add a borrower email on the Overview tab first.</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error && !compose ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : compose ? (
            <div className="space-y-3">
              <ComposeFields idPrefix="book-a-call" compose={compose} setCompose={setCompose} bodyRef={bodyRef} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="button" className="w-full" disabled={sending} onClick={handleSend}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {sentAt && (
        <p className="text-xs text-muted-foreground">
          ✓ Sent {sentAt.toLocaleDateString()} at {sentAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

export function TermSheetsTab({
  dealId,
  termSheets,
  products,
  isAdmin,
  hasBorrowerEmail,
  purchasePrice = null,
  estimatedAsIsValue = null,
  termSheetsSentToBorrowerAt = null,
  bookACallSentAt = null,
}: {
  dealId: string;
  termSheets: TermSheet[];
  products: ProductOption[];
  isAdmin: boolean;
  hasBorrowerEmail: boolean;
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
  termSheetsSentToBorrowerAt?: Date | null;
  bookACallSentAt?: Date | null;
}) {
  const router = useRouter();
  const shareable = termSheets.filter((t) => t.status !== "draft");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <SendTermSheetsDialog
            dealId={dealId}
            shareable={shareable}
            hasBorrowerEmail={hasBorrowerEmail}
            sentAt={termSheetsSentToBorrowerAt}
          />
          <BookACallDialog dealId={dealId} hasBorrowerEmail={hasBorrowerEmail} sentAt={bookACallSentAt} />
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button>New Term Sheet</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>New Term Sheet</DialogTitle>
            </DialogHeader>
            <NewTermSheetForm
              dealId={dealId}
              products={products}
              isAdmin={isAdmin}
              purchasePrice={purchasePrice}
              estimatedAsIsValue={estimatedAsIsValue}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {termSheets.map((termSheet) => {
          const generate = generateTermSheet.bind(null, dealId, termSheet.id);
          const sendForSignature = sendTermSheetForSignature.bind(null, dealId, termSheet.id);
          const updateFields = updateTermSheetFields.bind(null, dealId, termSheet.id);
          const clone = cloneTermSheet.bind(null, dealId, termSheet.id);
          const fieldDefs = [
            ...termSheetFieldsFor(termSheet.product.category),
            ...(isAdmin ? ADMIN_ONLY_FIELDS : []),
          ];
          const display = termSheetDisplayStatus(termSheet);
          const summary = termSheetSummary(termSheet.product.category, termSheet.fields, purchasePrice, estimatedAsIsValue);

          return (
            <Card key={termSheet.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {termSheet.lender.name} — {termSheet.product.name}
                  {summary && <span className="text-muted-foreground font-normal"> — {summary}</span>}
                </CardTitle>
                <Badge variant={display.variant}>{display.label}</Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Edit fields
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Edit term sheet fields</DialogTitle>
                    </DialogHeader>
                    <ActionForm action={updateFields} successMessage="Term sheet saved" className="space-y-4">
                      <TermSheetFieldInputs
                        fields={fieldDefs}
                        values={termSheet.fields}
                        category={termSheet.product.category}
                        purchasePrice={purchasePrice}
                        estimatedAsIsValue={estimatedAsIsValue}
                      />
                      <SubmitButton className="w-full">Save</SubmitButton>
                    </ActionForm>
                  </DialogContent>
                </Dialog>

                <ActionForm
                  action={clone}
                  successMessage="Cloned as a new draft — edit fields and generate its PDF"
                  onSuccess={() => router.refresh()}
                >
                  <SubmitButton variant="outline" size="sm">
                    Clone
                  </SubmitButton>
                </ActionForm>

                {termSheet.status === "draft" && (
                  <ActionForm action={generate} successMessage="PDF generated">
                    <SubmitButton size="sm">Generate PDF</SubmitButton>
                  </ActionForm>
                )}

                {termSheet.pdfUrl && (
                  <a href={termSheet.pdfUrl} target="_blank" rel="noreferrer">
                    <Button type="button" variant="secondary" size="sm">
                      View PDF
                    </Button>
                  </a>
                )}

                {termSheet.status !== "accepted" && termSheet.status !== "draft" && (
                  <ActionForm action={sendForSignature} successMessage="Sent to the borrower for signature">
                    <SubmitButton size="sm" variant="default" disabled={!hasBorrowerEmail}>
                      Send for Signature
                    </SubmitButton>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          );
        })}
        {termSheets.length === 0 && (
          <p className="text-sm text-muted-foreground">No term sheets yet.</p>
        )}
      </div>
    </div>
  );
}
