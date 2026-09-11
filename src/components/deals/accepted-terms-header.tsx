import { Lock, LockOpen } from "lucide-react";
import { toggleRateLock } from "@/server/actions/deals";
import {
  originationFeeSuggestion,
  STANDARD_PROCESSING_FEE,
  estimatedMonthlyPaymentFor,
} from "@/lib/term-sheet-calculations";
import { Button } from "@/components/ui/button";
import { EditAcceptedTermsDialog } from "@/components/deals/edit-accepted-terms-dialog";
import { cn } from "cn";

function money(value: string | number | null): string {
  const n = Number(value);
  return Number.isFinite(n) && value !== null ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
}

// Each field is its own boxed tile, always exactly 3 lines tall (label,
// value, and a hint line that renders even when empty) so every box is the
// same height regardless of which ones have a hint — the row reads
// left-to-right at a glance, with no horizontal scrolling (it wraps instead).
function Field({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center gap-0.5 rounded-md border bg-muted/30 px-3 py-1.5", className)}>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{hint || " "}</p>
    </div>
  );
}

export function AcceptedTermsHeader({
  dealId,
  lenderName,
  loanCategory,
  approvedLoanAmount,
  approvedLtv,
  appraisedValue,
  ltvBasedOnPurchasePrice,
  purchasePrice,
  estimatedAsIsValue,
  finalRate,
  rateLocked,
  estimatedFico,
  costToBorrowerFee,
  processingFeeOverride,
  finalAmortizationType,
  finalLoanTermYears,
  annualTaxes,
  annualInsurance,
  annualHoa,
  estimatedClosingDate,
}: {
  dealId: string;
  lenderName: string;
  loanCategory: string;
  approvedLoanAmount: string | null;
  approvedLtv: string | null;
  appraisedValue: string | null;
  ltvBasedOnPurchasePrice: boolean;
  purchasePrice: string | null;
  estimatedAsIsValue: string | null;
  finalRate: string | null;
  rateLocked: boolean;
  estimatedFico: number | null;
  costToBorrowerFee: string | null;
  processingFeeOverride: string | null;
  finalAmortizationType: string | null;
  finalLoanTermYears: number | null;
  annualTaxes: string | null;
  annualInsurance: string | null;
  annualHoa: string | null;
  estimatedClosingDate: Date | null;
}) {
  const toggleLock = toggleRateLock.bind(null, dealId, !rateLocked);

  const costToBorrowerLabel =
    loanCategory.startsWith("dscr") || loanCategory === "portfolio" ? "Rate Buydown Fee" : "Lender Fee";

  const loanAmountNum = Number(approvedLoanAmount) || 0;
  const originationFee = loanAmountNum > 0 ? originationFeeSuggestion(loanAmountNum) : 0;
  const processingFee = processingFeeOverride !== null ? Number(processingFeeOverride) : STANDARD_PROCESSING_FEE;

  const monthlyPayment = estimatedMonthlyPaymentFor(loanCategory, {
    loanAmount: loanAmountNum,
    annualRatePct: finalRate ? Number(finalRate) : null,
    loanTermYears: finalLoanTermYears,
    amortizationType: finalAmortizationType,
    annualTaxes: annualTaxes ? Number(annualTaxes) : null,
    annualInsurance: annualInsurance ? Number(annualInsurance) : null,
    annualHoa: annualHoa ? Number(annualHoa) : null,
  });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Field label="Lender" value={lenderName} />
          <Field label="Loan Term" value={finalLoanTermYears ? `${finalLoanTermYears} years` : "—"} />
          <Field label="Amortization" value={finalAmortizationType || "—"} />
          <Field label="Loan Amount" value={money(approvedLoanAmount)} />
          <Field
            label="LTV"
            value={approvedLtv !== null ? `${Number(approvedLtv).toFixed(1)}%` : "—"}
            hint={ltvBasedOnPurchasePrice ? "vs. purchase price" : "vs. appraised value"}
          />
          <Field label={costToBorrowerLabel} value={costToBorrowerFee ? money(costToBorrowerFee) : "—"} />
          <Field
            label="Interest Rate"
            value={
              <span className="flex items-center gap-1.5">
                {finalRate ? `${Number(finalRate)}%` : "—"}
                {rateLocked ? (
                  <span title="Locked">
                    <Lock className="size-3.5 text-green-600" />
                  </span>
                ) : (
                  <span title="Unlocked">
                    <LockOpen className="size-3.5 text-orange-500" />
                  </span>
                )}
              </span>
            }
          />
          <Field label={monthlyPayment.label} value={monthlyPayment.amount !== null ? money(monthlyPayment.amount) : "—"} />
          <Field label="Appraised Value" value={appraisedValue ? money(appraisedValue) : "—"} />
          <Field label="FICO" value={estimatedFico ?? "—"} />
          <Field label="Origination Fee" value={money(originationFee)} hint="2% of loan amount, $2,500 minimum" />
          <Field
            label="Processing Fee"
            value={money(processingFee)}
            hint={processingFeeOverride === null ? "standard" : "negotiated"}
          />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <EditAcceptedTermsDialog
              dealId={dealId}
              costToBorrowerLabel={costToBorrowerLabel}
              purchasePrice={purchasePrice ? Number(purchasePrice) : null}
              estimatedAsIsValue={estimatedAsIsValue ? Number(estimatedAsIsValue) : null}
              approvedLoanAmount={approvedLoanAmount ? Number(approvedLoanAmount) : null}
              approvedLtv={approvedLtv ? Number(approvedLtv) : null}
              appraisedValue={appraisedValue ? Number(appraisedValue) : null}
              ltvBasedOnPurchasePrice={ltvBasedOnPurchasePrice}
              finalRate={finalRate ? Number(finalRate) : null}
              estimatedFico={estimatedFico}
              costToBorrowerFee={costToBorrowerFee ? Number(costToBorrowerFee) : null}
              processingFeeOverride={processingFeeOverride ? Number(processingFeeOverride) : null}
              finalAmortizationType={finalAmortizationType}
              finalLoanTermYears={finalLoanTermYears}
            />
            <form action={toggleLock}>
              <Button type="submit" size="sm" variant={rateLocked ? "outline" : "default"}>
                {rateLocked ? "Unlock rate" : "Lock rate"}
              </Button>
            </form>
          </div>
          <Field
            label="Est. Closing"
            value={estimatedClosingDate ? estimatedClosingDate.toLocaleDateString() : "—"}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
