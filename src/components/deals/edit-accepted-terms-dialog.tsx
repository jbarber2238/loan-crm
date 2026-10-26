"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAcceptedTerms } from "@/server/actions/deals";
import { STANDARD_PROCESSING_FEE } from "@/lib/term-sheet-calculations";
import { termSheetFieldsFor } from "@/lib/term-sheet-fields";
import { conservativeValueBasis } from "@/lib/term-sheet-calculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TermSheetFieldInputs } from "@/components/deals/term-sheet-field-inputs";

const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

function money(n: number): string {
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
}

export function EditAcceptedTermsDialog({
  dealId,
  loanCategory,
  termSheetFields,
  hasAcceptedTermSheet,
  purchasePrice,
  estimatedAsIsValue,
  approvedLoanAmount,
  appraisedValue,
  ltvBasedOnPurchasePrice,
  approvedRehabCost,
  approvedArv,
  appraisedArv,
  ltarvBasedOnApprovedArv,
  approvedInitialAdvance,
  interestType,
  finalRate,
  estimatedFico,
  costToBorrowerFee,
  processingFeeOverride,
  originationPointsOverride,
  rateBuydownPointsOverride,
  finalAmortizationType,
  finalLoanTermYears,
  finalLoanTermMonths,
}: {
  dealId: string;
  loanCategory: string;
  // The accepted term sheet's own fields — the starting point for every
  // field this dialog shares with the term sheet form. Deal-level
  // approved*/final* overrides (below) win when set, since those reflect
  // edits made here after acceptance.
  termSheetFields: Record<string, unknown>;
  hasAcceptedTermSheet: boolean;
  purchasePrice: number | null;
  estimatedAsIsValue: number | null;
  approvedLoanAmount: number | null;
  appraisedValue: number | null;
  ltvBasedOnPurchasePrice: boolean;
  approvedRehabCost: number | null;
  approvedArv: number | null;
  appraisedArv: number | null;
  ltarvBasedOnApprovedArv: boolean;
  approvedInitialAdvance: number | null;
  interestType: string | null;
  finalRate: number | null;
  estimatedFico: number | null;
  costToBorrowerFee: number | null;
  processingFeeOverride: number | null;
  originationPointsOverride: number | null;
  rateBuydownPointsOverride: number | null;
  finalAmortizationType: string | null;
  finalLoanTermYears: number | null;
  finalLoanTermMonths: number | null;
}) {
  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(loanCategory);
  const router = useRouter();
  const updateTerms = updateAcceptedTerms.bind(null, dealId);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [regenerate, setRegenerate] = useState(false);

  const [appraised, setAppraised] = useState(String(appraisedValue ?? ""));
  const [basedOnPurchasePrice, setBasedOnPurchasePrice] = useState(ltvBasedOnPurchasePrice);
  const [fico, setFico] = useState(String(estimatedFico ?? ""));
  const [appraisedArvStr, setAppraisedArvStr] = useState(String(appraisedArv ?? ""));
  const [useApprovedArv, setUseApprovedArv] = useState(ltarvBasedOnApprovedArv);
  const [processingFee, setProcessingFee] = useState(
    processingFeeOverride !== null ? String(processingFeeOverride) : ""
  );

  const asIsBasisLabel = isHardMoneyDraw ? "LTC" : "LTV";

  // On a loan sized by LTV (everything but fix-and-flip and new construction) the LTV is the agreed number,
  // so changing what it's measured against moves the loan amount, not the LTV.
  const [loanAmountStr, setLoanAmountStr] = useState(approvedLoanAmount !== null ? String(approvedLoanAmount) : String(termSheetFields.loanAmount ?? ""));
  const [loanPatch, setLoanPatch] = useState<{ value: string; nonce: number } | null>(null);
  const [ltvNote, setLtvNote] = useState<string | null>(null);
  const purchaseBasisAmount = conservativeValueBasis(loanCategory, purchasePrice, estimatedAsIsValue);
  const basisAmount = (onPurchase: boolean, appraisedStr: string): number | null =>
    onPurchase ? purchaseBasisAmount : appraisedStr.trim() !== "" && Number(appraisedStr) > 0 ? Number(appraisedStr) : null;
  // The LTV being held steady: what the loan amount is against its current basis, remembered so retyping the
  // appraised value rescales from the same percentage instead of drifting.
  const [heldLtv, setHeldLtv] = useState<number | null>(() => {
    const loan = approvedLoanAmount ?? (Number(termSheetFields.loanAmount) || null);
    const basis = ltvBasedOnPurchasePrice ? conservativeValueBasis(loanCategory, purchasePrice, estimatedAsIsValue) : appraisedValue;
    return loan && basis ? loan / basis : null;
  });

  function pushLoanAmount(newLoan: number, ltv: number) {
    const value = String(Math.round(newLoan));
    setLoanAmountStr(value);
    setLoanPatch((p) => ({ value, nonce: (p?.nonce ?? 0) + 1 }));
    setLtvNote(`Loan amount set to ${money(Math.round(newLoan))} to keep the ${asIsBasisLabel} at ${(ltv * 100).toFixed(1)}%. You can still change it.`);
  }

  function chooseBasis(onPurchase: boolean) {
    if (onPurchase === basedOnPurchasePrice) return;
    const before = basisAmount(basedOnPurchasePrice, appraised);
    const after = basisAmount(onPurchase, appraised);
    const loan = Number(loanAmountStr);
    setBasedOnPurchasePrice(onPurchase);
    if (isHardMoneyDraw || !after) {
      setLtvNote(null);
      return;
    }
    const ltv = heldLtv ?? (loan > 0 && before ? loan / before : null);
    if (ltv) {
      setHeldLtv(ltv);
      pushLoanAmount(ltv * after, ltv);
    }
  }

  function changeAppraised(next: string) {
    setAppraised(next);
    if (isHardMoneyDraw || basedOnPurchasePrice) return;
    const after = next.trim() !== "" && Number(next) > 0 ? Number(next) : null;
    const loan = Number(loanAmountStr);
    const ltv = heldLtv ?? (loan > 0 && after ? loan / after : null);
    if (after && ltv) {
      setHeldLtv(ltv);
      pushLoanAmount(ltv * after, ltv);
    }
  }

  // A hand-typed loan amount becomes the new LTV to hold.
  function loanAmountTyped(v: string) {
    setLoanAmountStr(v);
    setLtvNote(null);
    const basis = basisAmount(basedOnPurchasePrice, appraised);
    if (Number(v) > 0 && basis) setHeldLtv(Number(v) / basis);
  }

  // Same field defs the term sheet form itself uses, so this dialog renders
  // identically for every field the two share. Deal-level overrides (set by
  // editing here previously) win over the term sheet's original numbers,
  // since those reflect what's actually true now (post-appraisal,
  // post-credit-pull) — falling back to the term sheet's own fields for
  // anything never overridden.
  const fieldDefs = termSheetFieldsFor(loanCategory);
  const values: Record<string, unknown> = {
    ...termSheetFields,
    ...(approvedLoanAmount !== null ? { loanAmount: approvedLoanAmount } : {}),
    ...(finalRate !== null ? { interestRate: finalRate } : {}),
    ...(finalAmortizationType !== null ? { amortizationType: finalAmortizationType } : {}),
    ...(finalLoanTermYears !== null ? { loanTermYears: finalLoanTermYears } : {}),
    ...(finalLoanTermMonths !== null ? { loanTermMonths: finalLoanTermMonths } : {}),
    ...(originationPointsOverride !== null ? { originationPoints: originationPointsOverride } : {}),
    ...(rateBuydownPointsOverride !== null ? { rateBuydownPoints: rateBuydownPointsOverride } : {}),
    ...(costToBorrowerFee !== null ? { costToBorrowerFee } : {}),
    ...(approvedInitialAdvance !== null ? { initialAdvance: approvedInitialAdvance } : {}),
    ...(approvedRehabCost !== null ? { approvedRehabCost } : {}),
    ...(approvedArv !== null ? { approvedArv } : {}),
    ...(interestType !== null ? { interestType } : {}),
  };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateTerms(formData);
        setOpen(false);
        toast.success(regenerate ? "Terms saved and term sheet updated" : "Terms saved");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit approved loan terms</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TermSheetFieldInputs
            fields={fieldDefs}
            values={values}
            category={loanCategory}
            purchasePrice={purchasePrice}
            estimatedAsIsValue={estimatedAsIsValue}
            onLoanAmountChange={(v) => loanAmountTyped(v)}
            loanAmountPatch={loanPatch}
          />

          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Additional Items (not on the term sheet)
            </p>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{asIsBasisLabel} is calculated against</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    purchase: true,
                    title: "Purchase price",
                    amount: conservativeValueBasis(loanCategory, purchasePrice, estimatedAsIsValue),
                    empty: "Not on the deal",
                  },
                  {
                    purchase: false,
                    title: "Appraised value",
                    amount: appraised.trim() !== "" && Number(appraised) > 0 ? Number(appraised) : null,
                    empty: "Not in yet",
                  },
                ].map((opt) => {
                  const selected = basedOnPurchasePrice === opt.purchase;
                  return (
                    <button
                      key={opt.title}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => chooseBasis(opt.purchase)}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        selected ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="block font-medium">{opt.title}</span>
                      <span className="block text-muted-foreground tabular-nums">
                        {opt.amount !== null && opt.amount !== undefined ? money(opt.amount) : opt.empty}
                      </span>
                    </button>
                  );
                })}
              </div>
              {basedOnPurchasePrice && <input type="hidden" name="ltvBasedOnPurchasePrice" value="on" />}
              {ltvNote && <p className="text-xs text-green-700 dark:text-green-400">{ltvNote}</p>}
              {!basedOnPurchasePrice && appraised.trim() === "" && (
                <p className="text-xs text-amber-600">There&apos;s no appraised value yet, so {asIsBasisLabel} will be blank until you enter one below.</p>
              )}
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="appraisedValue">{isHardMoneyDraw ? "Appraised as-is value" : "Appraised value"}</Label>
                <Input
                  id="appraisedValue"
                  name="appraisedValue"
                  type="number"
                  value={appraised}
                  onChange={(e) => changeAppraised(e.target.value)}
                  placeholder="Not in yet"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedFico">FICO</Label>
                <Input
                  id="estimatedFico"
                  name="estimatedFico"
                  type="number"
                  value={fico}
                  onChange={(e) => setFico(e.target.value)}
                />
              </div>
            </div>

            {isHardMoneyDraw && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="appraisedArv">Appraised ARV</Label>
                  <Input
                    id="appraisedArv"
                    name="appraisedArv"
                    type="number"
                    value={appraisedArvStr}
                    onChange={(e) => setAppraisedArvStr(e.target.value)}
                    placeholder="Not in yet"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="ltarvBasedOnApprovedArv"
                    checked={useApprovedArv}
                    onCheckedChange={(v) => setUseApprovedArv(v === true)}
                  />
                  LTARV based on approved ARV
                  <span className="text-xs text-muted-foreground">
                    (uncheck once the appraised ARV comes in, if it differs)
                  </span>
                </label>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="processingFeeOverride">Processing fee</Label>
              <Input
                id="processingFeeOverride"
                name="processingFeeOverride"
                type="number"
                value={processingFee}
                onChange={(e) => setProcessingFee(e.target.value)}
                placeholder={String(STANDARD_PROCESSING_FEE)}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to {money(STANDARD_PROCESSING_FEE)} — only fill this in if it was negotiated down.
              </p>
            </div>
          </div>

          {hasAcceptedTermSheet && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                name="regenerateTermSheet"
                checked={regenerate}
                onCheckedChange={(v) => setRegenerate(v === true)}
              />
              Also update the term sheet PDF with these changes
              <span className="text-xs text-muted-foreground">
                (so you can pull a fresh copy to send the borrower after an appraisal or credit pull)
              </span>
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
