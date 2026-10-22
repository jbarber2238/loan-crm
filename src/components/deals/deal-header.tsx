import { Mail } from "lucide-react";
import { DealHeaderShell, DealHeaderToggle } from "@/components/deals/deal-header-shell";
import { loadAssignablePartners } from "@/server/data/partner-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyBorrowerContactButton } from "@/components/deals/copy-borrower-contact-button";
import { ContactQuickActions } from "@/components/messaging/contact-quick-actions";
import { IntroButtons } from "@/components/deals/intro-buttons";
import { StageSelect } from "@/components/deals/stage-select";
import { DealActionsMenu } from "@/components/deals/deal-actions-menu";
import { CloneDealDialog } from "@/components/deals/clone-deal-dialog";
import { DscrConversionLinkDialog } from "@/components/deals/dscr-conversion-link-dialog";
import { PipelineStepper } from "@/components/deals/pipeline-stepper";
import { AcceptedTermsHeader } from "@/components/deals/accepted-terms-header";
import { ProcessingFeeInvoiceStatus } from "@/components/deals/processing-fee-invoice-status";
import { PartnerPayoutBanner } from "@/components/deals/partner-payout-banner";
import { LicenseFlagBanner } from "@/components/deals/license-flag-banner";
import { licenseFlagForAddress } from "@/server/licensing";
import { labelFor, LOAN_CATEGORIES, STAGES } from "@/lib/labels";
import { conservativeValueBasis } from "@/lib/term-sheet-calculations";
import { PAUSED_STAGES } from "@/lib/deal-pipeline";
import { sectionsFor, CONVERTIBLE_TO_DSCR_REFI_CATEGORIES } from "@/lib/loan-sections";
import { requireUser } from "@/server/auth/guards";
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

/**
 * Hide-on-phones-until-expanded marker for the header's detail pieces. Phones
 * and iPads (below lg) start collapsed to just the address and borrower name so
 * the activity being worked on gets the screen; laptops always show everything.
 * Kept here, not in the client shell: a client module's exports can't be read
 * as plain values from a server component.
 */
const HEADER_DETAIL = "max-lg:group-data-[open=false]/hdr:hidden";

export async function DealHeader({ deal }: { deal: DealDetail }) {
  const s = sectionsFor(deal.loanCategory);
  const currentUser = await requireUser();
  const licenseFlag = await licenseFlagForAddress(deal.propertyAddress);
  const partnerAssignment = currentUser.isAdmin
    ? {
        currentPartnerId: deal.referredByAffiliateId ?? null,
        partners: await loadAssignablePartners(),
      }
    : undefined;
  return (
    <DealHeaderShell>
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{deal.propertyAddress}</h1>
            <Badge variant="outline" className="text-xs shrink-0">
              Loan #{deal.loanNumber}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{deal.borrowerName}</span>
            <DealHeaderToggle />
            {deal.borrowerPhone && (
              <span className={`flex items-center gap-1 ${HEADER_DETAIL}`}>
                · {deal.borrowerPhone}
                <ContactQuickActions phone={deal.borrowerPhone} name={deal.borrowerName} contactType="Borrower" dealId={deal.id} />
              </span>
            )}
            {deal.borrowerEmail && (
              <span className={`flex items-center gap-1 ${HEADER_DETAIL}`}>
                · {deal.borrowerEmail}
                <Button asChild variant="ghost" size="icon-sm" title="Email borrower" aria-label="Email borrower">
                  <a href={`mailto:${deal.borrowerEmail}`}>
                    <Mail className="size-3.5" />
                  </a>
                </Button>
              </span>
            )}
            <span className={HEADER_DETAIL}>
              <CopyBorrowerContactButton name={deal.borrowerName} phone={deal.borrowerPhone} email={deal.borrowerEmail} />
            </span>
          </div>
          <p className={`mt-1.5 text-sm font-semibold text-foreground ${HEADER_DETAIL}`}>
            {labelFor(LOAN_CATEGORIES, deal.loanCategory)} · LO: {deal.assignedLoanOfficer.name}
            {deal.assignedProcessor && ` · Processor: ${deal.assignedProcessor.name}`}
          </p>
          {currentUser.baseRole === "processor" && (
            <div className={`mt-1.5 ${HEADER_DETAIL}`}>
              <IntroButtons dealId={deal.id} />
            </div>
          )}
          {deal.lenderId && deal.lender ? null : (
            (() => {
              const loanAmount = Number(deal.loanAmountRequested);
              const tail = deal.estimatedClosingDate
                ? ` · Est. Closing: ${deal.estimatedClosingDate.toLocaleDateString()}`
                : "";

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
                  <p className={`text-xs text-muted-foreground ${HEADER_DETAIL}`}>
                    Requested loan amount: ${loanAmount.toLocaleString()}
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
                <p className={`text-xs text-muted-foreground ${HEADER_DETAIL}`}>
                  Requested loan amount: ${loanAmount.toLocaleString()}
                  {requestedLtv !== null && ` · Requested LTV: ${requestedLtv.toFixed(1)}%`}
                  {tail}
                </p>
              );
            })()
          )}
        </div>
        <div className={`flex max-w-full flex-wrap items-center gap-2 ${HEADER_DETAIL}`}>
          {deal.loanCategory === "new_construction" && <CloneDealDialog dealId={deal.id} />}
          {CONVERTIBLE_TO_DSCR_REFI_CATEGORIES.has(deal.loanCategory) && (
            <DscrConversionLinkDialog dealId={deal.id} />
          )}
          <StageSelect dealId={deal.id} stage={deal.stage} />
          <DealActionsMenu
            dealId={deal.id}
            stage={deal.stage}
            propertyAddress={deal.propertyAddress}
            isArchived={Boolean(deal.archivedAt)}
            partnerAssignment={partnerAssignment}
          />
        </div>
      </div>

      <div className={`flex flex-col gap-3 ${HEADER_DETAIL}`}>
      <PipelineStepper stage={deal.stage} pausedFromStage={deal.pausedFromStage} />
      <StageReasonBanner deal={deal} />

      {licenseFlag && <LicenseFlagBanner flag={licenseFlag} />}
      <PartnerPayoutBanner deal={deal} isAdmin={currentUser.isAdmin} />

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
          dealStage={deal.stage}
          propertyAlreadyOwned={deal.propertyAlreadyOwned ?? false}
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
          mortgagePayoffAmount={deal.mortgagePayoffAmount}
          estimatedAsIsValue={deal.estimatedAsIsValue}
          finalRate={deal.finalRate}
          rateLocked={deal.rateLocked}
          rateLockExpiresAt={deal.rateLockExpiresAt}
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
    </DealHeaderShell>
  );
}
