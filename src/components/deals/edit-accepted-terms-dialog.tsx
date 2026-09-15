"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAcceptedTerms } from "@/server/actions/deals";
import { STANDARD_PROCESSING_FEE } from "@/lib/term-sheet-calculations";
import { termSheetFieldsFor } from "@/lib/term-sheet-fields";
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
          />

          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Additional Items (not on the term sheet)
            </p>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                name="ltvBasedOnPurchasePrice"
                checked={basedOnPurchasePrice}
                onCheckedChange={(v) => setBasedOnPurchasePrice(v === true)}
              />
              {asIsBasisLabel} based on purchase price
              <span className="text-xs text-muted-foreground">
                (uncheck once a real appraised value comes in if lender will base valuation on purchase price)
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="appraisedValue">{isHardMoneyDraw ? "Appraised as-is value" : "Appraised value"}</Label>
                <Input
                  id="appraisedValue"
                  name="appraisedValue"
                  type="number"
                  value={appraised}
                  onChange={(e) => setAppraised(e.target.value)}
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
