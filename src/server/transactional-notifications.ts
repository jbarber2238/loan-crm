import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactionalLoans, users } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { emailShell, escapeHtml, htmlButton, htmlFactList } from "@/lib/email-html";
import { transactionalFees, formatPoints } from "@/lib/transactional-fees";
import { formatDay, formatMoney } from "@/lib/transactional-shared";

type Loan = typeof transactionalLoans.$inferSelect;

/** Tells the admins about a new double-close request, with everything that was submitted and the calculated fees. Best-effort: callers swallow errors. */
export async function notifyAdminsOfNewTransactionalLoan(loan: Loan): Promise<void> {
  const admins = await db.query.users.findMany({
    where: and(eq(users.isAdmin, true), eq(users.active, true)),
    orderBy: asc(users.createdAt),
  });
  const sender = admins.find((a) => a.email);
  if (!sender?.email) return;
  const recipients = admins.map((a) => a.email).filter((e): e is string => Boolean(e));

  const funding = Number(loan.fundingAmount);
  const fees = transactionalFees({
    fundingAmount: funding,
    brokerPoints: loan.brokerPoints === null ? null : Number(loan.brokerPoints),
    sameDayFunding: loan.sameDayFunding,
  });
  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(sender.id),
  ]);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const body = emailShell({
    companyName,
    heading: `New double close request — ${loan.propertyAddress}`,
    bodyHtml: `
      ${htmlFactList([
        { label: "Property address", value: loan.propertyAddress },
        { label: "Funding amount", value: formatMoney(funding) },
        { label: "Closing date", value: formatDay(loan.closingDate) },
        { label: "Same-day funding", value: loan.sameDayFunding ? "Yes" : "No" },
        { label: "Confirmed traditional A-to-B, B-to-C double close", value: "Yes" },
        { label: "Borrower name", value: loan.borrowerName ?? "Not provided" },
        { label: "Borrower phone", value: loan.borrowerPhone ?? "Not provided" },
        { label: "Borrower email", value: loan.borrowerEmail ?? "Not provided" },
        { label: "Title company", value: loan.titleCompanyName ?? "Not provided" },
        { label: "Title agent", value: loan.titleAgentName ?? "Not provided" },
        { label: "Title phone", value: loan.titlePhone ?? "Not provided" },
        { label: "Title email", value: loan.titleEmail ?? "Not provided" },
        {
          label: "Total fee to borrower",
          value: fees.outsideStandardRange
            ? Number(loan.fundingAmount) > 1_000_000
              ? "Over $1,000,000 — CUSTOM PRICING: the borrower was told you'll contact them to run through it"
              : `${formatMoney(fees.totalFee)} (${formatPoints(fees.totalPoints)})`
            : `${formatMoney(fees.totalFee)} (${formatPoints(fees.totalPoints)})`,
        },
        { label: "Lender's portion", value: `${formatMoney(fees.lenderFee)} (${formatPoints(fees.lenderPoints)})` },
        { label: "Your portion", value: `${formatMoney(fees.brokerFee)} (${formatPoints(fees.brokerTotalPoints)})` },
      ])}
      <p style="margin:16px 0 0;">${htmlButton("Open the request", `${appUrl}/pipeline/transactional/${loan.id}`)}</p>
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: recipients.join(", "),
    subject: `New double close request — ${loan.propertyAddress} — ${formatMoney(funding)}`,
    body: logoHtml + body + signatureHtml,
    html: true,
    category: "transactional_new_loan",
  });
}

/** Tells the borrower we have their request and will be in touch shortly. Best-effort: callers swallow errors. */
export async function sendTransactionalReceipt(loan: Loan): Promise<void> {
  if (!loan.borrowerEmail) return;
  const sender = await db.query.users.findFirst({
    where: and(eq(users.isAdmin, true), eq(users.active, true)),
    orderBy: asc(users.createdAt),
  });
  if (!sender?.email) return;

  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(sender.id),
  ]);
  const firstName = (loan.borrowerName ?? "").trim().split(/\s+/)[0] || "there";

  const body = emailShell({
    companyName,
    heading: "We've received your funding request",
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;">We've received your formal request for funding. Here's what you submitted:</p>
      ${htmlFactList([
        { label: "Property", value: loan.propertyAddress },
        { label: "Funding amount", value: formatMoney(Number(loan.fundingAmount)) },
        { label: "Closing date", value: formatDay(loan.closingDate) },
      ])}
      <p style="margin:16px 0 0;"><strong>What happens next:</strong> we'll contact ${escapeHtml(loan.titleCompanyName ?? "your title company")} to coordinate funding the A-to-B portion of your transaction. If we need anything else from you, we'll reach out.</p>
      <p style="margin:16px 0 0;">This email doesn't confirm pricing — our fees are published on our website.</p>
      <p style="margin:16px 0 0;">If anything on your request changes, just reply to this email.</p>
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: loan.borrowerEmail,
    subject: `We've received your funding request — ${loan.propertyAddress}`,
    body: logoHtml + body + signatureHtml,
    html: true,
    category: "transactional_receipt",
  });
}
