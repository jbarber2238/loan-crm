import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { DEFAULT_COMPANY_NAME } from "@/server/settings";
import {
  calculateDscrRatio,
  calculateDutchMonthlyInterest,
  calculateInitialMonthlyInterest,
  estimatedMonthlyPI,
  estimatedMonthlyPitia,
  estimatedReservesRequired,
  originationFeeSuggestion,
  ratioMetricsFor,
  STANDARD_APPRAISAL_ESTIMATE,
  STANDARD_CREDIT_PULL_ESTIMATE,
  STANDARD_PROCESSING_FEE,
} from "@/lib/term-sheet-calculations";

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica" },
  header: { marginBottom: 12, borderBottom: 1.5, borderBottomColor: "#111", paddingBottom: 10 },
  companyName: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  propertyAddress: { fontSize: 15, fontWeight: 700 },
  borrowerName: { fontSize: 10, color: "#555", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, fontSize: 8, color: "#666" },
  columns: { flexDirection: "row", gap: 10, marginBottom: 10 },
  column: { flex: 1 },
  card: { border: 0.5, borderColor: "#ddd", borderRadius: 3, marginBottom: 10 },
  cardHeader: { backgroundColor: "#111", color: "#fff", fontSize: 9, fontWeight: 700, padding: 5 },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottom: 0.5,
    borderBottomColor: "#eee",
  },
  rowCompact: {
    flexDirection: "row",
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderBottom: 0.5,
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
  payButton: {
    marginTop: 4,
    marginHorizontal: 6,
    marginBottom: 6,
    backgroundColor: "#111",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 6,
    borderRadius: 3,
    fontWeight: 700,
    textDecoration: "none",
  },
  disclosures: { fontSize: 7, color: "#666", lineHeight: 1.4, marginTop: 6 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7.5, color: "#888", textAlign: "center" },
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
  companyName?: string;
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
}

export function TermSheetPdf({
  companyName = DEFAULT_COMPANY_NAME,
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
}: TermSheetPdfProps) {
  const loanAmount = num(fields, "loanAmount");
  const rate = num(fields, "interestRate");
  const loanTermYears = num(fields, "loanTermYears");
  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(loanCategory);
  const interestType = fields.interestType === "Non-Dutch" ? "Non-Dutch" : "Dutch";

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
  const downPayment = purchasePrice !== null ? purchasePrice - loanAmount : 0;
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
          <Text style={styles.companyName}>{companyName}</Text>
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
              <Row label="Interest Rate" value={pct(fields.interestRate)} />
              <Row label="Loan Term" value={fields.loanTermYears ? `${fields.loanTermYears} years` : "—"} />
              <Row label="Amortization" value={text(fields.amortizationType)} />
              <Row label="Prepayment Penalty" value={text(fields.prepaymentPenalty)} />
              <Row label="Lien Position" value={text(fields.lienPosition ?? "1st position")} />
              <Row label="Credit Pull Type" value={text(fields.creditPullType)} />
              {monthlyPitia > 0 && <Row label="Est. Monthly PITIA" value={money(monthlyPitia)} />}
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
              {typeof fields.processingFeePaymentLink === "string" && fields.processingFeePaymentLink && (
                <Link src={fields.processingFeePaymentLink} style={styles.payButton}>
                  Pay {money(processingFee)} Processing Fee
                </Link>
              )}
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

        <Text style={styles.footer}>
          {companyName} — This term sheet is indicative and subject to underwriting approval.
        </Text>
      </Page>
    </Document>
  );
}
