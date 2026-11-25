import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { invoiceMoney, pointsText, type BrokerInvoiceFee } from "@/lib/broker-invoice";

// The broker invoice a lender asks for so our origination fee lands on the settlement statement. One page, one
// line item, in the company's own colors. It goes to the lender, never the borrower, so the lender's name is
// printed on it.

const TEAL = "#143D4A";
const SAND = "#CBB8A0";
const CREAM = "#F6F1E9";
const INK = "#1E1E1E";
const MUTED = "#6B6459";
const RULE = "#E4D9C7";

const PAD = 44;

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: INK, paddingBottom: 64 },
  band: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: PAD,
    paddingVertical: 26,
  },
  logo: { height: 46 },
  companyWordmark: { fontSize: 20, fontWeight: 700 },
  bandRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 9, fontWeight: 700, letterSpacing: 2.4 },
  invoiceNumber: { fontSize: 18, fontWeight: 700, marginTop: 5 },
  invoiceDate: { fontSize: 9.5, marginTop: 4 },
  accent: { height: 4, backgroundColor: SAND },
  body: { paddingHorizontal: PAD, paddingTop: 30 },
  parties: { flexDirection: "row", gap: 28 },
  party: { flex: 1 },
  eyebrow: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.4, color: MUTED, marginBottom: 6 },
  partyName: { fontSize: 13, fontWeight: 700, color: TEAL },
  partyLine: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  section: { marginTop: 28 },
  loanBox: { borderWidth: 0.75, borderColor: RULE, borderRadius: 5 },
  loanRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: 0.75, borderBottomColor: RULE },
  loanRowLast: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 12 },
  loanLabel: { width: 130, color: MUTED },
  loanValue: { flex: 1, fontWeight: 700 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: TEAL,
    color: CREAM,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: RULE,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  colDescription: { flex: 1 },
  colAmount: { width: 110, textAlign: "right" },
  itemName: { fontSize: 11, fontWeight: 700 },
  itemBasis: { fontSize: 9, color: MUTED, marginTop: 3 },
  itemAmount: { fontSize: 11, fontWeight: 700 },
  totalWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totalBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 270,
    backgroundColor: CREAM,
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  totalLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: TEAL },
  totalValue: { fontSize: 17, fontWeight: 700, color: TEAL },
  terms: { marginTop: 26, fontSize: 9.5, lineHeight: 1.5, color: INK },
  footer: {
    position: "absolute",
    left: PAD,
    right: PAD,
    bottom: 26,
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    paddingTop: 9,
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
  },
});

export interface BrokerInvoicePdfProps {
  companyName: string;
  /** A data: URI for a PNG or JPEG. Null prints the company name instead. */
  logoSrc: string | null;
  /** True when the logo is light-colored, so it sits on the dark band; a dark logo gets a light band. */
  logoIsLight: boolean;
  /** Company NMLS ID, when it holds one. */
  companyNmlsId: string | null;
  invoiceNumber: string;
  /** Already written out, such as "November 25, 2026". */
  invoiceDate: string;
  lenderName: string;
  contact: { name: string | null; email: string | null; phone: string | null };
  borrowerName: string;
  borrowerEntityName: string | null;
  propertyAddress: string;
  loanTypeLabel: string;
  loanNumber: number;
  /** Already written out, or null when no closing date is set. */
  estimatedClosing: string | null;
  fee: BrokerInvoiceFee;
}

function wholeDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function BrokerInvoicePdf({
  companyName,
  logoSrc,
  logoIsLight,
  companyNmlsId,
  invoiceNumber,
  invoiceDate,
  lenderName,
  contact,
  borrowerName,
  borrowerEntityName,
  propertyAddress,
  loanTypeLabel,
  loanNumber,
  estimatedClosing,
  fee,
}: BrokerInvoicePdfProps) {
  // A light logo needs the dark band behind it. A dark logo (or no logo at all) reads better on cream.
  const darkBand = logoSrc ? logoIsLight : true;
  const bandBackground = darkBand ? TEAL : CREAM;
  const bandText = darkBand ? CREAM : TEAL;
  const bandLabel = darkBand ? SAND : MUTED;

  const loanRows: [string, string][] = [
    ["Borrower", borrowerName],
    ...(borrowerEntityName ? ([["Borrowing entity", borrowerEntityName]] as [string, string][]) : []),
    ["Property", propertyAddress],
    ["Loan type", loanTypeLabel],
    ["Loan amount", wholeDollars(fee.loanAmount)],
    ["Broker loan no.", String(loanNumber)],
    ...(estimatedClosing ? ([["Estimated closing", estimatedClosing]] as [string, string][]) : []),
  ];

  const basis = fee.minimumApplied
    ? `Minimum origination fee on a ${wholeDollars(fee.loanAmount)} loan amount`
    : `${pointsText(fee.points)} of the ${wholeDollars(fee.loanAmount)} loan amount`;

  const contactLine = [contact.email, contact.phone].filter(Boolean).join("  |  ");
  const footerLine = [companyName, companyNmlsId ? `NMLS ${companyNmlsId}` : null, contact.email, contact.phone]
    .filter(Boolean)
    .join("   |   ");

  return (
    <Document title={`Broker Invoice ${invoiceNumber}`} author={companyName}>
      <Page size="LETTER" style={styles.page}>
        <View style={[styles.band, { backgroundColor: bandBackground }]}>
          {logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
            <Image src={logoSrc} style={styles.logo} />
          ) : (
            <Text style={[styles.companyWordmark, { color: bandText }]}>{companyName}</Text>
          )}
          <View style={styles.bandRight}>
            <Text style={[styles.docTitle, { color: bandLabel }]}>BROKER INVOICE</Text>
            <Text style={[styles.invoiceNumber, { color: bandText }]}>{invoiceNumber}</Text>
            <Text style={[styles.invoiceDate, { color: bandText }]}>{invoiceDate}</Text>
          </View>
        </View>
        <View style={styles.accent} />

        <View style={styles.body}>
          <View style={styles.parties}>
            <View style={styles.party}>
              <Text style={styles.eyebrow}>FROM</Text>
              <Text style={styles.partyName}>{companyName}</Text>
              {contact.name && <Text style={styles.partyLine}>{contact.name}, Loan Officer</Text>}
              {contactLine.length > 0 && <Text style={styles.partyLine}>{contactLine}</Text>}
              {companyNmlsId && <Text style={styles.partyLine}>NMLS {companyNmlsId}</Text>}
            </View>
            <View style={styles.party}>
              <Text style={styles.eyebrow}>BILL TO</Text>
              <Text style={styles.partyName}>{lenderName}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.eyebrow}>LOAN</Text>
            <View style={styles.loanBox}>
              {loanRows.map(([label, value], i) => (
                <View key={label} style={i === loanRows.length - 1 ? styles.loanRowLast : styles.loanRow}>
                  <Text style={styles.loanLabel}>{label}</Text>
                  <Text style={styles.loanValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.tableHead}>
              <Text style={styles.colDescription}>DESCRIPTION</Text>
              <Text style={styles.colAmount}>AMOUNT</Text>
            </View>
            <View style={styles.tableRow}>
              <View style={styles.colDescription}>
                <Text style={styles.itemName}>Broker origination fee</Text>
                <Text style={styles.itemBasis}>{basis}</Text>
              </View>
              <Text style={[styles.colAmount, styles.itemAmount]}>{invoiceMoney(fee.fee)}</Text>
            </View>
            <View style={styles.totalWrap}>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>TOTAL DUE AT CLOSING</Text>
                <Text style={styles.totalValue}>{invoiceMoney(fee.fee)}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.terms}>
            Payable to {companyName} at closing. Please include this fee on the settlement statement and disburse
            it at funding.
          </Text>
        </View>

        <Text fixed style={styles.footer}>
          {footerLine}
        </Text>
      </Page>
    </Document>
  );
}
