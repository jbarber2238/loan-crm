import { Lock, LockOpen } from "lucide-react";
import { toggleRateLock } from "@/server/actions/deals";
import {
  originationFeeForPoints,
  rateBuydownFeeForPoints,
  isRateBuydownCategory,
  STANDARD_PROCESSING_FEE,
  estimatedMonthlyPaymentFor,
  calculateInitialMonthlyInterest,
  calculateDutchMonthlyInterest,
  calculateEstimatedCashToClose,
} from "@/lib/term-sheet-calculations";
import { isInterestOnlyCategory, rehabOrConstructionBudgetLabel } from "@/lib/loan-sections";

const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { EditAcceptedTermsDialog } from "@/components/deals/edit-accepted-terms-dialog";
import { SubmitApplicationButton } from "@/components/deals/submit-application-button";
import { cn } from "cn";

function money(value: string | number | null): string {
  const n = Number(value);
  return Number.isFinite(n) && value !== null ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
}

// Each field is its own boxed tile — label, value, and a hint line that
// renders even when empty so every box lines up the same way. Everything
// wraps instead of truncating, so a longer value (e.g. "Interest Only") or
// label is never clipped — tiles just grow to a second line instead.
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
    <div className={cn("flex min-w-0 flex-col justify-center gap-0.5 rounded-md border bg-muted/30 px-2.5 py-1", className)}>
      <p className="break-words text-[10px] leading-tight text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-semibold">{value}</p>
      <p className="break-words text-[10px] leading-tight text-muted-foreground">{hint || " "}</p>
    </div>
  );
}

// A full-width heading dropped into the tile grid to mark where one group of
// fields ends and the next begins. Tiles themselves stay in the single grid
// below (not a nested grid per group) so each tile still gets its share of
// the full header width — a narrow per-group box would otherwise force its
// own tiles into cramped, wrapping columns regardless of how much room the
// header actually has.
function GroupLabel({ title, first }: { title: string; first?: boolean }) {
  return (
    <p
      className={cn(
        "col-span-full text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        !first && "mt-1 border-t pt-1"
      )}
    >
      {title}
    </p>
  );
}

export function AcceptedTermsHeader({
  dealId,
  lenderName,
  loanCategory,
  acceptedTermSheetFields,
  approvedLoanAmount,
  approvedLtv,
  appraisedValue,
  ltvBasedOnPurchasePrice,
  approvedRehabCost,
  approvedArv,
  appraisedArv,
  ltarvBasedOnApprovedArv,
  approvedLtarv,
  approvedLtc,
  approvedInitialAdvance,
  interestType,
  purchasePrice,
  estimatedAsIsValue,
  finalRate,
  rateLocked,
  estimatedFico,
  costToBorrowerFee,
  processingFeeOverride,
  originationPointsOverride,
  rateBuydownPointsOverride,
  finalAmortizationType,
  finalLoanTermYears,
  finalLoanTermMonths,
  annualTaxes,
  annualInsurance,
  annualHoa,
  estimatedClosingDate,
  applicationSubmissionMethod,
  brokerPortalUrl,
}: {
  dealId: string;
  lenderName: string;
  loanCategory: string;
  acceptedTermSheetFields: Record<string, unknown> | null;
  approvedLoanAmount: string | null;
  approvedLtv: string | null;
  appraisedValue: string | null;
  ltvBasedOnPurchasePrice: boolean;
  approvedRehabCost: string | null;
  approvedArv: string | null;
  appraisedArv: string | null;
  ltarvBasedOnApprovedArv: boolean;
  approvedLtarv: string | null;
  approvedLtc: string | null;
  approvedInitialAdvance: string | null;
  interestType: string | null;
  purchasePrice: string | null;
  estimatedAsIsValue: string | null;
  finalRate: string | null;
  rateLocked: boolean;
  estimatedFico: number | null;
  costToBorrowerFee: string | null;
  processingFeeOverride: string | null;
  originationPointsOverride: string | null;
  rateBuydownPointsOverride: string | null;
  finalAmortizationType: string | null;
  finalLoanTermYears: number | null;
  finalLoanTermMonths: number | null;
  annualTaxes: string | null;
  annualInsurance: string | null;
  annualHoa: string | null;
  estimatedClosingDate: Date | null;
  applicationSubmissionMethod: "portal" | "email" | null;
  brokerPortalUrl: string | null;
}) {
  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(loanCategory);
  const toggleLock = toggleRateLock.bind(null, dealId, !rateLocked);

  const isRateBuydown = isRateBuydownCategory(loanCategory);
  const costToBorrowerLabel = isRateBuydown ? "Rate Buydown Fee" : "Lender Fee";

  const loanAmountNum = Number(approvedLoanAmount) || 0;
  const originationPoints = originationPointsOverride !== null ? Number(originationPointsOverride) : 2;
  const originationFee = loanAmountNum > 0 ? originationFeeForPoints(loanAmountNum, originationPoints) : 0;
  const processingFee = processingFeeOverride !== null ? Number(processingFeeOverride) : STANDARD_PROCESSING_FEE;
  const rateBuydownPoints = rateBuydownPointsOverride !== null ? Number(rateBuydownPointsOverride) : 0;
  const effectiveCostToBorrowerFee = isRateBuydown
    ? loanAmountNum > 0
      ? rateBuydownFeeForPoints(loanAmountNum, rateBuydownPoints)
      : 0
    : costToBorrowerFee
      ? Number(costToBorrowerFee)
      : null;

  const monthlyPayment = estimatedMonthlyPaymentFor(loanCategory, {
    loanAmount: loanAmountNum,
    annualRatePct: finalRate ? Number(finalRate) : null,
    loanTermYears: finalLoanTermYears,
    amortizationType: finalAmortizationType,
    annualTaxes: annualTaxes ? Number(annualTaxes) : null,
    annualInsurance: annualInsurance ? Number(annualInsurance) : null,
    annualHoa: annualHoa ? Number(annualHoa) : null,
  });

  // Dutch charges interest on the full loan amount from day one, so there's
  // no separate "initial" figure to show — just the one payment. Non-Dutch
  // only charges interest on what's actually been advanced so far, so both
  // the day-one payment (against the initial advance) and the eventual max
  // payment (against the full loan amount, once fully drawn) matter.
  const initialAdvanceNum = Number(approvedInitialAdvance) || 0;
  const rateNum = finalRate ? Number(finalRate) : null;
  const hardMoneyMonthlyPayments =
    interestType === "Dutch"
      ? [
          {
            label: "Monthly Payment",
            amount: loanAmountNum > 0 && rateNum ? calculateDutchMonthlyInterest(loanAmountNum, rateNum) : null,
          },
        ]
      : [
          {
            label: "Initial Monthly Payment",
            amount: initialAdvanceNum > 0 && rateNum ? calculateInitialMonthlyInterest(initialAdvanceNum, rateNum) : null,
          },
          {
            label: "Max Monthly Payment",
            amount: loanAmountNum > 0 && rateNum ? calculateDutchMonthlyInterest(loanAmountNum, rateNum) : null,
          },
        ];

  // Only the underwriting/doc fee has no promoted deal column of its own —
  // everything else this formula needs already has one (see the header's
  // other props), so it's the one input still read straight off the
  // accepted term sheet's own fields, updated whenever "regenerate term
  // sheet" is used in the edit dialog.
  const underwritingDocFeeValue = acceptedTermSheetFields?.underwritingDocFee;
  const underwritingDocFeeNum = typeof underwritingDocFeeValue === "number" ? underwritingDocFeeValue : 0;
  const closingDisbursement = isHardMoneyDraw && initialAdvanceNum > 0 ? initialAdvanceNum : loanAmountNum;
  const estimatedCashToClose = calculateEstimatedCashToClose({
    purchasePrice: purchasePrice ? Number(purchasePrice) : null,
    closingDisbursement,
    originationFee,
    costToBorrowerFee: effectiveCostToBorrowerFee ?? 0,
    underwritingDocFee: underwritingDocFeeNum,
    processingFee,
  });

  const loanTermValue = isInterestOnlyCategory(loanCategory)
    ? finalLoanTermMonths
      ? `${finalLoanTermMonths} months`
      : "—"
    : finalLoanTermYears
      ? `${finalLoanTermYears} years`
      : "—";

  const interestRateValue = (
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
  );

  // Shared between both layouts below, but placed differently: the
  // hard-money-draw grid has group-label rows the other layout doesn't, so
  // its tile rows aren't actually the grid's row 1 / row 3 the way they look
  // — they're row 2 / row 4. Rather than guess a pixel offset to fake
  // alignment with those rows (fragile — it only holds at the one viewport
  // width it was measured against), these become real grid items placed at
  // the exact row the tiles they should align with actually occupy, so the
  // browser's own row-sizing keeps them aligned at any width. The other
  // layout has no such rows, so it keeps rendering this as a plain sibling
  // column instead.
  const cashToCloseField = (
    <Field
      label="Cash to Close"
      value={money(estimatedCashToClose)}
      hint="down payment + fees, excl. reserves"
      className="w-full"
    />
  );
  const estClosingField = (
    <Field
      label="Est. Closing"
      value={estimatedClosingDate ? estimatedClosingDate.toLocaleDateString() : "—"}
      className="w-full"
    />
  );
  const editLockAndSubmit = (
    <>
      <div className="flex items-center gap-2">
        <EditAcceptedTermsDialog
          dealId={dealId}
          loanCategory={loanCategory}
          termSheetFields={acceptedTermSheetFields ?? {}}
          hasAcceptedTermSheet={acceptedTermSheetFields !== null}
          purchasePrice={purchasePrice ? Number(purchasePrice) : null}
          estimatedAsIsValue={estimatedAsIsValue ? Number(estimatedAsIsValue) : null}
          approvedLoanAmount={approvedLoanAmount ? Number(approvedLoanAmount) : null}
          appraisedValue={appraisedValue ? Number(appraisedValue) : null}
          ltvBasedOnPurchasePrice={ltvBasedOnPurchasePrice}
          approvedRehabCost={approvedRehabCost ? Number(approvedRehabCost) : null}
          approvedArv={approvedArv ? Number(approvedArv) : null}
          appraisedArv={appraisedArv ? Number(appraisedArv) : null}
          ltarvBasedOnApprovedArv={ltarvBasedOnApprovedArv}
          approvedInitialAdvance={approvedInitialAdvance ? Number(approvedInitialAdvance) : null}
          interestType={interestType}
          finalRate={finalRate ? Number(finalRate) : null}
          estimatedFico={estimatedFico}
          costToBorrowerFee={costToBorrowerFee ? Number(costToBorrowerFee) : null}
          processingFeeOverride={processingFeeOverride ? Number(processingFeeOverride) : null}
          originationPointsOverride={originationPointsOverride ? Number(originationPointsOverride) : null}
          rateBuydownPointsOverride={rateBuydownPointsOverride !== null ? Number(rateBuydownPointsOverride) : null}
          finalAmortizationType={finalAmortizationType}
          finalLoanTermYears={finalLoanTermYears}
          finalLoanTermMonths={finalLoanTermMonths}
        />
        <ActionForm action={toggleLock} successMessage={rateLocked ? "Rate unlocked" : "Rate locked"}>
          <SubmitButton size="sm" variant={rateLocked ? "outline" : "default"}>
            {rateLocked ? "Unlock rate" : "Lock rate"}
          </SubmitButton>
        </ActionForm>
      </div>
      <SubmitApplicationButton dealId={dealId} method={applicationSubmissionMethod} portalUrl={brokerPortalUrl} />
    </>
  );
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap items-start gap-3">
        {isHardMoneyDraw ? (
          <div className="grid flex-1 items-start grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
            <GroupLabel title="Loan Terms" first />
            <Field label="Lender" value={lenderName} />
            <Field label="Loan Amount" value={money(approvedLoanAmount)} />
            <Field label="Initial Advance" value={money(approvedInitialAdvance)} />
            <Field label={rehabOrConstructionBudgetLabel(loanCategory)} value={money(approvedRehabCost)} />
            <Field
              label="LTARV"
              value={approvedLtarv !== null ? `${Number(approvedLtarv).toFixed(1)}%` : "—"}
              hint={ltarvBasedOnApprovedArv ? "vs. approved ARV" : "vs. appraised ARV"}
            />
            <Field
              label="LTC"
              value={approvedLtc !== null ? `${Number(approvedLtc).toFixed(1)}%` : "—"}
              hint={ltvBasedOnPurchasePrice ? "vs. purchase price" : "vs. appraised value"}
            />
            {/* Placed at the exact grid row the "Loan Terms" tiles actually
                occupy (row 2 — row 1 is the group label above), rather than
                a guessed offset on a separate column: this stays correct
                regardless of how tall any row ends up being. Only kicks in
                at md, where this grid actually has the 7th column to place
                it in — below that it just falls into the normal tile flow. */}
            <div className="md:col-start-7 md:row-start-2">{cashToCloseField}</div>

            <GroupLabel title="Rate & Payment" />
            <Field label="Interest Rate" value={interestRateValue} />
            <Field label="Loan Term" value={loanTermValue} />
            <Field label="Amortization" value={finalAmortizationType || "—"} />
            <Field label="Interest Type" value={interestType || "—"} />
            {hardMoneyMonthlyPayments.map((p) => (
              <Field key={p.label} label={p.label} value={p.amount !== null ? money(p.amount) : "—"} />
            ))}
            {/* Row 4 — the "Rate & Payment" tile row. Explicit placement
                means this lands here whether that row has 5 tiles (Dutch)
                or 6 (non-Dutch), instead of drifting a column depending on
                which. */}
            <div className="md:col-start-7 md:row-start-4">{estClosingField}</div>

            <div className="col-span-full grid items-start grid-cols-1 gap-x-2 gap-y-1.5 border-t pt-1 sm:grid-cols-2 md:col-span-6">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Valuation</p>
                <div className="grid items-start grid-cols-2 gap-1.5 sm:grid-cols-3">
                  <Field label="Appraised As-Is Value" value={appraisedValue ? money(appraisedValue) : "—"} />
                  <Field label="Appraised ARV" value={appraisedArv ? money(appraisedArv) : "—"} />
                  <Field label="FICO" value={estimatedFico ?? "—"} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Our Fees</p>
                <div className="grid items-start grid-cols-2 gap-1.5 sm:grid-cols-3">
                  <Field
                    label="Origination Points"
                    value={`${originationPoints}%`}
                    hint={originationPointsOverride === null ? "standard" : "negotiated"}
                  />
                  <Field
                    label="Origination Fee"
                    value={money(originationFee)}
                    hint={originationPointsOverride === null ? "2% of loan amount, $2,500 minimum" : "negotiated"}
                  />
                  <Field
                    label="Processing Fee"
                    value={money(processingFee)}
                    hint={processingFeeOverride === null ? "standard" : "negotiated"}
                  />
                </div>
              </div>
            </div>

            {/* Row 5 — alongside the Valuation/Our Fees block above. Not
                specifically requested, but a natural consequence of the
                same real-grid placement rather than a special case. */}
            <div className="flex flex-col items-end gap-2 md:col-start-7 md:row-start-5">{editLockAndSubmit}</div>
          </div>
        ) : (
          <>
            <div className="grid flex-1 items-start grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
              <Field label="Lender" value={lenderName} />
              <Field label="Loan Term" value={loanTermValue} />
              <Field label="Amortization" value={finalAmortizationType || "—"} />
              <Field label="Loan Amount" value={money(approvedLoanAmount)} />
              <Field
                label="LTV"
                value={approvedLtv !== null ? `${Number(approvedLtv).toFixed(1)}%` : "—"}
                hint={ltvBasedOnPurchasePrice ? "vs. purchase price" : "vs. appraised value"}
              />
              {isRateBuydown && (
                <Field
                  label="Rate Buydown Points"
                  value={`${rateBuydownPoints}%`}
                  hint={rateBuydownPointsOverride === null ? "no buydown" : "negotiated"}
                />
              )}
              <Field
                label={costToBorrowerLabel}
                value={effectiveCostToBorrowerFee ? money(effectiveCostToBorrowerFee) : "—"}
                hint={isRateBuydown ? (rateBuydownPointsOverride === null ? "no buydown" : "negotiated") : undefined}
              />
              <Field label="Interest Rate" value={interestRateValue} />
              <Field label={monthlyPayment.label} value={monthlyPayment.amount !== null ? money(monthlyPayment.amount) : "—"} />
              <Field label="Appraised Value" value={appraisedValue ? money(appraisedValue) : "—"} />
              <Field label="FICO" value={estimatedFico ?? "—"} />
              <Field
                label="Origination Points"
                value={`${originationPoints}%`}
                hint={originationPointsOverride === null ? "standard" : "negotiated"}
              />
              <Field
                label="Origination Fee"
                value={money(originationFee)}
                hint={originationPointsOverride === null ? "2% of loan amount, $2,500 minimum" : "negotiated"}
              />
              <Field
                label="Processing Fee"
                value={money(processingFee)}
                hint={processingFeeOverride === null ? "standard" : "negotiated"}
              />
            </div>

            {/* This layout has no group-label rows, so its tiles really are
                row one — a plain sibling column lines up correctly without
                needing any of the grid-placement tricks above. */}
            <div className="flex shrink-0 flex-col items-end gap-2">
              {cashToCloseField}
              {estClosingField}
              {editLockAndSubmit}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
