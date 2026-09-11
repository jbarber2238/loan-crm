"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAcceptedTerms } from "@/server/actions/deals";
import { originationFeeSuggestion, STANDARD_PROCESSING_FEE } from "@/lib/term-sheet-calculations";
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

function money(n: number): string {
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
}

export function EditAcceptedTermsDialog({
  dealId,
  costToBorrowerLabel,
  purchasePrice,
  estimatedAsIsValue,
  approvedLoanAmount,
  approvedLtv,
  appraisedValue,
  ltvBasedOnPurchasePrice,
  finalRate,
  estimatedFico,
  costToBorrowerFee,
  processingFeeOverride,
  finalAmortizationType,
  finalLoanTermYears,
}: {
  dealId: string;
  costToBorrowerLabel: string;
  purchasePrice: number | null;
  estimatedAsIsValue: number | null;
  approvedLoanAmount: number | null;
  approvedLtv: number | null;
  appraisedValue: number | null;
  ltvBasedOnPurchasePrice: boolean;
  finalRate: number | null;
  estimatedFico: number | null;
  costToBorrowerFee: number | null;
  processingFeeOverride: number | null;
  finalAmortizationType: string | null;
  finalLoanTermYears: number | null;
}) {
  const router = useRouter();
  const updateTerms = updateAcceptedTerms.bind(null, dealId);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [loanAmount, setLoanAmount] = useState(String(approvedLoanAmount ?? ""));
  const [ltv, setLtv] = useState(approvedLtv !== null ? approvedLtv.toFixed(2) : "");
  const [appraised, setAppraised] = useState(String(appraisedValue ?? ""));
  const [basedOnPurchasePrice, setBasedOnPurchasePrice] = useState(ltvBasedOnPurchasePrice);
  const [rate, setRate] = useState(String(finalRate ?? ""));
  const [fico, setFico] = useState(String(estimatedFico ?? ""));
  const [amortizationType, setAmortizationType] = useState(finalAmortizationType ?? "");
  const [loanTermYears, setLoanTermYears] = useState(String(finalLoanTermYears ?? ""));
  const [buydownFee, setBuydownFee] = useState(String(costToBorrowerFee ?? ""));
  const [processingFee, setProcessingFee] = useState(
    processingFeeOverride !== null ? String(processingFeeOverride) : ""
  );

  function valueBasis(useAppraised: boolean, appraisedStr: string) {
    if (useAppraised) {
      const a = Number(appraisedStr);
      if (a > 0) return a;
    }
    return purchasePrice ?? estimatedAsIsValue ?? null;
  }

  function recalcFromLtv(nextLtv: string, useAppraised: boolean, appraisedStr: string) {
    const basis = valueBasis(useAppraised, appraisedStr);
    const ltvNum = Number(nextLtv);
    if (basis && ltvNum > 0) {
      setLoanAmount(String(Math.round((ltvNum / 100) * basis)));
    }
  }

  function recalcFromLoanAmount(nextAmount: string, useAppraised: boolean, appraisedStr: string) {
    const basis = valueBasis(useAppraised, appraisedStr);
    const amountNum = Number(nextAmount);
    if (basis && amountNum > 0) {
      setLtv(((amountNum / basis) * 100).toFixed(2));
    }
  }

  function handleLoanAmountChange(v: string) {
    setLoanAmount(v);
    recalcFromLoanAmount(v, !basedOnPurchasePrice, appraised);
  }

  function handleLtvChange(v: string) {
    setLtv(v);
    recalcFromLtv(v, !basedOnPurchasePrice, appraised);
  }

  function handleAppraisedChange(v: string) {
    setAppraised(v);
    if (!basedOnPurchasePrice) recalcFromLtv(ltv, true, v);
  }

  function handleBasisToggle(nextBasedOnPurchasePrice: boolean) {
    setBasedOnPurchasePrice(nextBasedOnPurchasePrice);
    recalcFromLtv(ltv, !nextBasedOnPurchasePrice, appraised);
  }

  const previewLoanAmount = Number(loanAmount) || 0;
  const previewOriginationFee = previewLoanAmount > 0 ? originationFeeSuggestion(previewLoanAmount) : 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateTerms(formData);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit approved loan terms</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="ltvBasedOnPurchasePrice"
              checked={basedOnPurchasePrice}
              onCheckedChange={(v) => handleBasisToggle(v === true)}
            />
            LTV based on purchase price
            <span className="text-xs text-muted-foreground">
              (uncheck once a real appraised value comes in if lender will base valuation on purchase price)
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="appraisedValue">Appraised value</Label>
            <Input
              id="appraisedValue"
              name="appraisedValue"
              type="number"
              value={appraised}
              onChange={(e) => handleAppraisedChange(e.target.value)}
              placeholder="Not in yet"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="approvedLtv">Approved LTV</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="approvedLtv"
                  name="approvedLtv"
                  type="number"
                  step="0.01"
                  value={ltv}
                  onChange={(e) => handleLtvChange(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approvedLoanAmount">Approved loan amount</Label>
              <Input
                id="approvedLoanAmount"
                name="approvedLoanAmount"
                type="number"
                value={loanAmount}
                onChange={(e) => handleLoanAmountChange(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Editing either one recalculates the other against{" "}
            {basedOnPurchasePrice ? "purchase price / as-is value" : "appraised value"}.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="finalLoanTermYears">Loan term (years)</Label>
              <Input
                id="finalLoanTermYears"
                name="finalLoanTermYears"
                type="number"
                value={loanTermYears}
                onChange={(e) => setLoanTermYears(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finalAmortizationType">Amortization</Label>
              <Input
                id="finalAmortizationType"
                name="finalAmortizationType"
                value={amortizationType}
                onChange={(e) => setAmortizationType(e.target.value)}
                placeholder="e.g. Fixed, 5/6 ARM"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="finalRate">Interest rate</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="finalRate"
                  name="finalRate"
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
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

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Broker Points &amp; Processing Fee
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="costToBorrowerFee">{costToBorrowerLabel}</Label>
              <Input
                id="costToBorrowerFee"
                name="costToBorrowerFee"
                type="number"
                value={buydownFee}
                onChange={(e) => setBuydownFee(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label>Origination fee (auto)</Label>
              <p className="text-sm font-semibold">
                {money(previewOriginationFee)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  2% of loan amount, $2,500 minimum
                </span>
              </p>
            </div>
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
