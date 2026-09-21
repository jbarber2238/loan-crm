import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactQuickActions } from "@/components/messaging/contact-quick-actions";
import { StageSelect } from "@/components/deals/stage-select";
import { DealActionsMenu } from "@/components/deals/deal-actions-menu";
import { CloneDealDialog } from "@/components/deals/clone-deal-dialog";
import { PipelineStepper } from "@/components/deals/pipeline-stepper";
import { AcceptedTermsHeader } from "@/components/deals/accepted-terms-header";
import { ProcessingFeeInvoiceStatus } from "@/components/deals/processing-fee-invoice-status";
import { ReferralFeeBanner } from "@/components/deals/referral-fee-banner";
import { labelFor, LOAN_CATEGORIES, STAGES } from "@/lib/labels";
import { conservativeValueBasis } from "@/lib/term-sheet-calculations";
import { PAUSED_STAGES } from "@/lib/deal-pipeline";
import { sectionsFor } from "@/lib/loan-sections";
import type { DealDetail } from "@/server/data/deal-detail";

function StageReasonBanner({ deal }: { deal: DealDetail }) {
  const reason = PAUSED_STAGES.has(deal.stage)
    ? deal.pauseReason
    : deal.stage === "lost"
      ? deal.lostReason
      : deal.stage === "disqualified"
        ? deal.disqualifiedReason
        : null;
  if (!reason) return null;

  const label =
    deal.stage === "lost" ? "Lost" : deal.stage === "disqualified" ? "Disqualified" : labelFor(STAGES, deal.stage);

  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {reason}
    </p>
  );
}

export function DealHeader({ deal }: { deal: DealDetail }) {
  const s = sectionsFor(deal.loanCategory);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{deal.propertyAddress}</h1>
            <Badge variant="outline" className="text-xs shrink-0">
              Loan #{deal.loanNumber}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{deal.borrowerName}</span>
            {deal.borrowerPhone && (
              <span className="flex items-center gap-1">
                · {deal.borrowerPhone}
                <ContactQuickActions phone={deal.borrowerPhone} name={deal.borrowerName} contactType="Borrower" dealId={deal.id} />
              </span>
            )}
            {deal.borrowerEmail && (
              <span className="flex items-center gap-1">
                · {deal.borrowerEmail}
                <Button asChild variant="ghost" size="icon-sm" title="Email borrower" aria-label="Email borrower">
                  <a href={`mailto:${deal.borrowerEmail}`}>
                    <Mail className="size-3.5" />
                  </a>
                </Button>
              </span>
            )}
          </div>
          {deal.lenderId && deal.lender ? (
            <p className="text-xs text-muted-foreground">
              {labelFor(LOAN_CATEGORIES, deal.loanCategory)} · LO:{" "}
              {deal.assignedLoanOfficer.name}
              {deal.assignedProcessor && ` · Processor: ${deal.assignedProcessor.name}`}
            </p>
          ) : (
            (() => {
              const loanAmount = Number(deal.loanAmountRequested);
              const tail = (
                <>
                  {" "}
                  · LO: {deal.assignedLoanOfficer.name}
                  {deal.assignedProcessor && ` · Processor: ${deal.assignedProcessor.name}`}
                  {deal.estimatedClosingDate &&
                    ` · Est. Closing: ${deal.estimatedClosingDate.toLocaleDateString()}`}
                </>
              );

              // Rehab/construction deals (fix-and-flip, new construction,
              // bridge) are sized against the after-repair value and the
              // total project cost, not a straight purchase-price LTV.
              if (s.showProjectEconomics) {
                const purchasePrice = deal.purchasePrice ? Number(deal.purchasePrice) : null;
                const rehabCost = deal.estimatedRehabCost ? Number(deal.estimatedRehabCost) : null;
                const arv = deal.estimatedArv ? Number(deal.estimatedArv) : null;
                const totalProjectCost =
                  purchasePrice !== null && rehabCost !== null ? purchasePrice + rehabCost : null;
                const ltarv = arv ? (loanAmount / arv) * 100 : null;
                const ltc = totalProjectCost ? (loanAmount / totalProjectCost) * 100 : null;
                return (
                  <p className="text-xs text-muted-foreground">
                    {labelFor(LOAN_CATEGORIES, deal.loanCategory)} · Requested loan amount: $
                    {loanAmount.toLocaleString()}
                    {ltarv !== null && ` · LTARV: ${ltarv.toFixed(1)}%`}
                    {ltc !== null && ` · LTC: ${ltc.toFixed(1)}%`}
                    {tail}
                  </p>
                );
              }

              const basis = conservativeValueBasis(
                deal.loanCategory,
                deal.purchasePrice ? Number(deal.purchasePrice) : null,
                deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
              );
              const requestedLtv = basis ? (loanAmount / basis) * 100 : null;
              return (
                <p className="text-xs text-muted-foreground">
                  {labelFor(LOAN_CATEGORIES, deal.loanCategory)} · Requested loan amount: $
                  {loanAmount.toLocaleString()}
                  {requestedLtv !== null && ` · Requested LTV: ${requestedLtv.toFixed(1)}%`}
                  {tail}
                </p>
              );
            })()
          )}
        </div>
        <div className="flex items-center gap-2">
          {deal.loanCategory === "new_construction" && <CloneDealDialog dealId={deal.id} />}
          <StageSelect dealId={deal.id} stage={deal.stage} />
          <DealActionsMenu
            dealId={deal.id}
            stage={deal.stage}
            propertyAddress={deal.propertyAddress}
            isArchived={Boolean(deal.archivedAt)}
          />
        </div>
      </div>

      <PipelineStepper stage={deal.stage} pausedFromStage={deal.pausedFromStage} />
      <StageReasonBanner deal={deal} />

      {deal.stage === "closed" && deal.referredByAffiliate && (
        <ReferralFeeBanner
          dealId={deal.id}
          affiliateName={deal.referredByAffiliate.name ?? deal.referredByAffiliate.email}
          paid={Boolean(deal.referralFeePaidAt)}
        />
      )}

      {deal.stripeInvoiceStatus && deal.stripeInvoiceAmount && (
        <ProcessingFeeInvoiceStatus
          dealId={deal.id}
          amount={Number(deal.stripeInvoiceAmount)}
          status={deal.stripeInvoiceStatus}
          url={deal.stripeInvoiceUrl}
        />
      )}

      {deal.lenderId && deal.lender && (
        <AcceptedTermsHeader
          dealId={deal.id}
          lenderName={deal.lender.name}
          loanCategory={deal.loanCategory}
          acceptedTermSheetFields={deal.termSheets.find((t) => t.status === "accepted")?.fields ?? null}
          approvedLoanAmount={deal.approvedLoanAmount}
          approvedLtv={deal.approvedLtv}
          appraisedValue={deal.appraisedValue}
          ltvBasedOnPurchasePrice={deal.ltvBasedOnPurchasePrice}
          approvedRehabCost={deal.approvedRehabCost}
          approvedArv={deal.approvedArv}
          appraisedArv={deal.appraisedArv}
          ltarvBasedOnApprovedArv={deal.ltarvBasedOnApprovedArv}
          approvedLtarv={deal.approvedLtarv}
          approvedLtc={deal.approvedLtc}
          approvedInitialAdvance={deal.approvedInitialAdvance}
          interestType={deal.interestType}
          purchasePrice={deal.purchasePrice}
          estimatedAsIsValue={deal.estimatedAsIsValue}
          finalRate={deal.finalRate}
          rateLocked={deal.rateLocked}
          estimatedFico={deal.estimatedFico}
          costToBorrowerFee={deal.costToBorrowerFee}
          processingFeeOverride={deal.processingFeeOverride}
          originationPointsOverride={deal.originationPointsOverride}
          rateBuydownPointsOverride={deal.rateBuydownPointsOverride}
          finalAmortizationType={deal.finalAmortizationType}
          finalLoanTermYears={deal.finalLoanTermYears}
          finalLoanTermMonths={deal.finalLoanTermMonths}
          annualTaxes={deal.annualTaxes}
          annualInsurance={deal.annualInsurance}
          annualHoa={deal.annualHoa}
          estimatedClosingDate={deal.estimatedClosingDate}
          applicationSubmissionMethod={deal.lender.applicationSubmissionMethod}
          brokerPortalUrl={deal.lender.brokerPortalUrl}
        />
      )}
    </div>
  );
}
