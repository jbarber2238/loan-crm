import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactionalLoans, users } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { emailShell, htmlButton, htmlFactList } from "@/lib/email-html";
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
        { label: "Borrower name", value: loan.borrowerName ?? "Not provided" },
        { label: "Borrower phone", value: loan.borrowerPhone ?? "Not provided" },
        { label: "Borrower email", value: loan.borrowerEmail ?? "Not provided" },
        { label: "Title company", value: loan.titleCompanyName ?? "Not provided" },
        { label: "Title agent", value: loan.titleAgentName ?? "Not provided" },
        { label: "Title phone", value: loan.titlePhone ?? "Not provided" },
        { label: "Title email", value: loan.titleEmail ?? "Not provided" },
        { label: "Total fee to borrower", value: `${formatMoney(fees.totalFee)} (${formatPoints(fees.totalPoints)})` },
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
