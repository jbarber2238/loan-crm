export const TRANSACTIONAL_STAGES = [
  { value: "new", label: "New" },
  { value: "sent_to_lender", label: "Sent to Lender" },
  { value: "funded", label: "Funded" },
  { value: "closed", label: "Closed" },
  { value: "lost", label: "Lost" },
] as const;

export type TransactionalStage = (typeof TRANSACTIONAL_STAGES)[number]["value"];

// Still moving toward a close: everything except Closed and Lost.
export const OPEN_TRANSACTIONAL_STAGES = new Set<string>(["new", "sent_to_lender", "funded"]);

export function transactionalStageLabel(stage: string): string {
  return TRANSACTIONAL_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/** A calendar day stored at UTC midnight, shown as the day it was entered. */
export function formatDay(date: Date | string | null): string {
  if (!date) return "Not provided";
  return new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export interface LenderEmailInput {
  lenderName: string;
  closingDate: Date | string | null;
  borrowerName: string | null;
  borrowerPhone: string | null;
  borrowerEmail: string | null;
  fundingAmount: number;
  titleCompanyName: string | null;
  titleAgentName: string | null;
  titlePhone: string | null;
  titleEmail: string | null;
}

const orBlank = (v: string | null) => v?.trim() || "";

/** The email to the transactional lender, built from the intake information. */
export function buildLenderEmailBody(i: LenderEmailInput): string {
  return [
    `Hello ${i.lenderName},`,
    "",
    `I have a double close that needs funding by ${formatDay(i.closingDate)}.`,
    "",
    `Borrower Name: ${orBlank(i.borrowerName)}`,
    `Borrower Phone: ${orBlank(i.borrowerPhone)}`,
    `Borrower Email: ${orBlank(i.borrowerEmail)}`,
    "",
    `Funding Amount: ${formatMoney(i.fundingAmount)}`,
    "",
    `Title Company Name: ${orBlank(i.titleCompanyName)}`,
    `Title Agent Name: ${orBlank(i.titleAgentName)}`,
    `Title Phone: ${orBlank(i.titlePhone)}`,
    `Title Email: ${orBlank(i.titleEmail)}`,
    "",
    "Best Regards,",
  ].join("\n");
}
