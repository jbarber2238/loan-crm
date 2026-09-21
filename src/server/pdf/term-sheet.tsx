import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { rehabOrConstructionBudgetLabel, isInterestOnlyCategory } from "@/lib/loan-sections";
import {
  calculateDscrRatio,
  calculateDutchMonthlyInterest,
  calculateInitialMonthlyInterest,
  estimatedMonthlyPI,
  estimatedMonthlyPitia,
  estimatedReservesRequired,
  originationFeeSuggestion,
  ratioMetricsFor,
  REFINANCE_CATEGORIES,
  STANDARD_APPRAISAL_ESTIMATE,
  STANDARD_CREDIT_PULL_ESTIMATE,
  STANDARD_PROCESSING_FEE,
} from "@/lib/term-sheet-calculations";

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica" },
  header: { marginBottom: 12, borderBottomWidth: 1.5, borderBottomColor: "#111", paddingBottom: 10 },
  propertyAddress: { fontSize: 15, fontWeight: 700 },
  borrowerName: { fontSize: 10, color: "#555", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, fontSize: 8, color: "#666" },
  columns: { flexDirection: "row", gap: 10, marginBottom: 10 },
  column: { flex: 1 },
  card: { borderWidth: 0.5, borderColor: "#ddd", borderRadius: 3, marginBottom: 10 },
  cardHeader: { backgroundColor: "#111", color: "#fff", fontSize: 9, fontWeight: 700, padding: 5 },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  rowCompact: {
    flexDirection: "row",
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  rowLabel: { color: "#555", width: 130 },
  rowValue: { fontWeight: 700, flex: 1, textAlign: "right" },
  cardHeaderCompact: { backgroundColor: "#111", color: "#fff", fontSize: 8, fontWeight: 700, padding: 3 },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#f5f5f5",
  },
  totalLabel: { fontWeight: 700, width: 130 },
  totalValue: { fontWeight: 700, flex: 1, textAlign: "right" },
  disclosures: { fontSize: 7, color: "#666", lineHeight: 1.4, marginTop: 6 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7.5, color: "#888", textAlign: "center" },
  signatureBlock: { marginTop: 24 },
  // Needs an explicit height — an empty View with only a border-bottom and
  // no content collapses to zero height under Yoga's layout, which makes
  // the line itself never actually render. The height also doubles as
  // blank space to sign in, matching how the lenders' own PDFs do it.
  signatureLine: { borderBottomWidth: 0.75, borderBottomColor: "#333", width: 260, height: 24 },
  signatureLabel: { fontSize: 8, color: "#555", marginTop: 3 },
  signatureTag: { fontSize: 9, color: "#000" },
});

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—";
}

function pct(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n}%` : "—";
}

function text(value: unknown): string {
  return typeof value === "string" && value.length ? value : "—";
}

function num(fields: Record<string, unknown>, key: string): number {
  const n = Number(fields[key]);
  return Number.isFinite(n) ? n : 0;
}

function Row({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={compact ? styles.rowCompact : styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

export interface TermSheetPdfProps {
  borrowerName: string;
  borrowerEntityName: string | null;
  propertyAddress: string;
  loanCategory: string;
  generatedAt: Date;
  fields: Record<string, unknown>;
  purchasePrice: number | null;
  estimatedAsIsValue: number | null;
  annualTaxes: number | null;
  annualInsurance: number | null;
  annualHoa: number | null;
  currentRent: number | null;
  // True only for the copy fetched by PandaDoc when sending for
  // e-signature — swaps the signature line's label for a PandaDoc field
  // tag (plain bracket text PandaDoc's parser converts into a real,
  // clickable signature field). Left off for every other use of this PDF
  // (the "View PDF" link, emailed links) so nobody ever sees raw tag text.
  forSignature?: boolean;
}

export function TermSheetPdf({
  borrowerName,
  borrowerEntityName,
  propertyAddress,
  loanCategory,
  generatedAt,
  fields,
  purchasePrice,
  estimatedAsIsValue,
  annualTaxes,
  annualInsurance,
  annualHoa,
  currentRent,
  forSignature = false,
}: TermSheetPdfProps) {
  const loanAmount = num(fields, "loanAmount");
  const rate = num(fields, "interestRate");
  const loanTermYears = num(fields, "loanTermYears");
  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(loanCategory);
  // Bridge and hard-money draw loans are always interest-only in practice —
  // a full amortizing "Est. Monthly PITIA" over the short loan term (often
  // 12 months) produces a nonsensical payment (near the full loan amount
  // divided by 12), so that row is suppressed for these categories in favor
  // of the Initial/Max Interest Payment rows already shown below.
  const isInterestOnly = isInterestOnlyCategory(loanCategory);
  const interestType = fields.interestType === "Dutch" ? "Dutch" : "Non-Dutch";

  const ratios = ratioMetricsFor(loanCategory, {
    loanAmount,
    purchasePrice,
    estimatedAsIsValue,
    approvedArv: num(fields, "approvedArv") || null,
    approvedRehabCost: num(fields, "approvedRehabCost") || null,
  });

  const monthlyPI = estimatedMonthlyPI(loanAmount, rate, loanTermYears);
  const monthlyPitia = estimatedMonthlyPitia(monthlyPI, annualTaxes, annualInsurance, annualHoa);
  const dscrRatioValue = DSCR_CATEGORIES.has(loanCategory) ? calculateDscrRatio(currentRent, monthlyPitia) : null;

  const originationFee =
    fields.originationFee !== undefined ? num(fields, "originationFee") : originationFeeSuggestion(loanAmount);
  const costToBorrowerFee = num(fields, "costToBorrowerFee");
  const underwritingDocFee = num(fields, "underwritingDocFee");
  // Only the initial advance is actually disbursed at closing on a
  // hard-money draw loan — the rest of the committed loan amount funds later
  // draws, so it isn't part of the cash-at-closing math. Using the full loan
  // amount here makes down payment (and everything derived from it) wildly
  // negative once the committed amount exceeds the purchase price.
  const initialAdvance = num(fields, "initialAdvance");
  const closingDisbursement = isHardMoneyDraw && initialAdvance > 0 ? initialAdvance : loanAmount;
  // A refinance has no purchase happening — purchasePrice on these deals is
  // the property's historical purchase price, not part of financing the new
  // loan, and must never be netted against the loan amount here (same trap
  // valueBasisFor/ratioMetricsFor already guard against for LTV).
  const downPayment =
    purchasePrice !== null && !REFINANCE_CATEGORIES.has(loanCategory) ? purchasePrice - closingDisbursement : 0;
  const appraisalFee = STANDARD_APPRAISAL_ESTIMATE;
  const creditPullFee = STANDARD_CREDIT_PULL_ESTIMATE;
  const processingFee = STANDARD_PROCESSING_FEE;

  const reservesFromPitia = DSCR_CATEGORIES.has(loanCategory) || loanCategory === "portfolio";
  const reservesMonths = num(fields, "reservesMonths") || 6;
  const reserves = reservesFromPitia
    ? estimatedReservesRequired(monthlyPitia, reservesMonths)
    : num(fields, "reservesRequired");
  const reservesLabel = reservesFromPitia
    ? `Reserves Required (${reservesMonths} mo. PITIA, not held in escrow)`
    : "Reserves Required (not held in escrow)";

  const costToBorrowerLabel =
    loanCategory.startsWith("dscr") || loanCategory === "portfolio" ? "Rate Buydown Fee" : "Lender Fee";

  const cashAtClosingTotal = downPayment + originationFee + costToBorrowerFee + underwritingDocFee;
  const paidPriorTotal = appraisalFee + creditPullFee + processingFee;
  const totalCashDue = cashAtClosingTotal + paidPriorTotal;
  const cashToShow = totalCashDue + reserves;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.propertyAddress}>{propertyAddress}</Text>
          <Text style={styles.borrowerName}>
            Borrower: {borrowerName}
            {borrowerEntityName ? `   |   Borrowing Entity: ${borrowerEntityName}` : ""}
          </Text>
          <View style={styles.metaRow}>
            <Text>{labelFor(LOAN_CATEGORIES, loanCategory)}</Text>
            <Text>{generatedAt.toLocaleDateString("en-US")}</Text>
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.cardHeader}>Loan Summary</Text>
              <Row label="Total Loan Amount" value={money(fields.loanAmount)} />
              {isHardMoneyDraw && (
                <>
                  <Row label="Initial Advance" value={money(fields.initialAdvance)} />
                  <Row
                    label={rehabOrConstructionBudgetLabel(loanCategory)}
                    value={money(fields.approvedRehabCost)}
                  />
                </>
              )}
              <Row label="Interest Rate" value={pct(fields.interestRate)} />
              <Row
                label="Loan Term"
                value={
                  isInterestOnly
                    ? fields.loanTermMonths
                      ? `${fields.loanTermMonths} months`
                      : "—"
                    : fields.loanTermYears
                      ? `${fields.loanTermYears} years`
                      : "—"
                }
              />
              <Row label="Amortization" value={text(fields.amortizationType)} />
              <Row label="Prepayment Penalty" value={text(fields.prepaymentPenalty)} />
              <Row label="Lien Position" value={text(fields.lienPosition ?? "1st position")} />
              <Row label="Credit Pull Type" value={text(fields.creditPullType)} />
              {!isInterestOnly && monthlyPitia > 0 && <Row label="Est. Monthly PITIA" value={money(monthlyPitia)} />}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardHeader}>Cash at Closing</Text>
              {downPayment > 0 && <Row label="Down Payment + EMD" value={money(downPayment)} />}
              <Row label="Origination Fee" value={money(originationFee)} />
              {costToBorrowerFee > 0 && <Row label={costToBorrowerLabel} value={money(costToBorrowerFee)} />}
              <Row label="Underwriting and Doc Fee" value={money(underwritingDocFee)} />
              <TotalRow label="Subtotal — Cash at Closing" value={money(cashAtClosingTotal)} />
            </View>
          </View>

          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.cardHeaderCompact}>Calculated Ratios</Text>
              {ratios.map((r) => (
                <Row
                  key={r.label}
                  label={r.label}
                  value={r.valuePct !== null ? `${r.valuePct.toFixed(1)}%` : "—"}
                  compact
                />
              ))}
              {dscrRatioValue !== null && <Row label="DSCR Ratio" value={dscrRatioValue.toFixed(2)} compact />}
              {isHardMoneyDraw && interestType === "Dutch" && (
                <Row
                  label="Monthly Interest Payment"
                  value={money(calculateDutchMonthlyInterest(loanAmount, rate))}
                  compact
                />
              )}
              {isHardMoneyDraw && interestType === "Non-Dutch" && (
                <>
                  <Row
                    label="Initial Interest Payment"
                    value={money(calculateInitialMonthlyInterest(num(fields, "initialAdvance"), rate))}
                    compact
                  />
                  <Row
                    label="Max Interest Payment"
                    value={money(calculateDutchMonthlyInterest(loanAmount, rate))}
                    compact
                  />
                </>
              )}
              {loanCategory.startsWith("bridge_") && (
                <>
                  <Row label="Exit Strategy" value={text(fields.exitStrategy)} compact />
                  <Row label="Extension Terms" value={text(fields.extensionTerms)} compact />
                </>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardHeader}>Paid Prior to Closing (at time of service)</Text>
              <Row label="Processing Fee (non-refundable)" value={money(processingFee)} />
              <Row label="Appraisal (Estimated)" value={money(appraisalFee)} />
              <Row label="Credit Pull (Estimated)" value={money(creditPullFee)} />
              <TotalRow label="Total Estimated Cash Due from Borrower" value={money(totalCashDue)} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardHeader}>Cash to Show</Text>
              <Row label="Total Estimated Cash Due" value={money(totalCashDue)} />
              <Row label={reservesLabel} value={money(reserves)} />
              <TotalRow label="Cash to Show" value={money(cashToShow)} />
            </View>
          </View>
        </View>

        <View style={styles.disclosures}>
          <Text>
            This is an estimate only and is not a commitment to lend. Terms are indicative and subject to
            change based on appraisal, credit report, and full underwriting review. This term sheet does not
            include third-party settlement costs (title, escrow, hazard insurance, etc.) — contact your
            closing agent for a complete schedule of fees and final cash to close.
          </Text>
          <Text style={{ marginTop: 4 }}>
            This is a business-purpose loan, not a consumer loan, and the property may not be occupied as a
            primary residence or second home by any borrower, guarantor, or their immediate family — if you
            intend to occupy it as such, do not accept this term sheet.
          </Text>
          <Text style={{ marginTop: 4 }}>
            A Processing Fee of {money(processingFee)} is required upon acceptance of this term sheet, and
            processing will not begin until it is paid. The fee is earned upon receipt and is non-refundable,
            except that a partial refund of up to 50% may be issued if all of the following are true: the
            Borrower fully cooperated and timely provided all requested documentation; the property qualified
            under the lender&apos;s guidelines; the loan received final approval on the agreed terms; and the
            selected lender still failed to fund solely due to the lender&apos;s inability to perform. No other
            circumstance qualifies for a refund.
          </Text>
        </View>

        <View style={[styles.disclosures, { marginTop: 10 }]}>
          <Text style={{ fontSize: 8, fontWeight: 700, color: "#333" }}>
            Business Purpose Attestation &amp; Fee Agreement
          </Text>
          <Text style={{ marginTop: 3 }}>
            If you intend to occupy any property securing this loan as a primary residence or second home, do
            not accept this term sheet. By accepting, you represent that the loan proceeds will be used solely
            for business purposes and that no property securing this loan will be occupied as a primary
            residence or second home by any borrower, guarantor, or their immediate family. Because this is a
            business-purpose loan, certain consumer protection laws that apply to personal loans — including
            the Truth in Lending Act and the Real Estate Settlement Procedures Act — do not apply here.
          </Text>
          <Text style={{ marginTop: 4 }}>
            Upon closing of any loan resulting from this term sheet, you agree to pay the origination,
            underwriting, doc prep, and other fees disclosed above, and to reimburse any third-party costs we
            incur on your behalf, including credit reports, appraisals, and title insurance and endorsements.
          </Text>
          <Text style={{ marginTop: 8, fontSize: 8, fontWeight: 700, color: "#333" }}>
            Authorization to Obtain and Release Information
          </Text>
          <Text style={{ marginTop: 3 }}>
            By accepting this term sheet, you authorize us to conduct due diligence and background checks on
            all borrowers, guarantors, and related parties, and to gather financial, credit, and background
            information about them for purposes of reviewing this loan request. You also authorize us to share
            this information with lenders, title companies, and other third parties involved in underwriting
            and closing the loan. Outside of that process, your non-public personal information will be kept
            confidential and will not be shared with third parties.
          </Text>
        </View>

        <View style={styles.signatureBlock}>
          {forSignature ? (
            // PandaDoc field tag — plain bracket text its parser finds in
            // the PDF's text layer and swaps for a real, clickable
            // signature field at this position. Never shown to a human;
            // PandaDoc replaces it before the recipient ever opens the doc.
            <Text style={styles.signatureTag}>{"{signature:Client_______}"}</Text>
          ) : (
            <View style={styles.signatureLine} />
          )}
          <Text style={styles.signatureLabel}>Applicant Signature</Text>
        </View>

        <Text style={styles.footer}>This term sheet is indicative and subject to underwriting approval.</Text>
      </Page>
    </Document>
  );
}
