import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getDealDetail } from "@/server/data/deal-detail";
import { getAllProductOptions } from "@/server/actions/client-need-catalog";
import { LoanCenterTab } from "@/components/deals/loan-center-tab";

export default async function DealLoanCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  const [allUsers, clientNeedsCatalog, conditions, clientNeeds, categoryProducts, allProducts] = await Promise.all([
    db.query.users.findMany({ where: (users, { eq }) => eq(users.active, true) }),
    db.query.clientNeeds.findMany({
      columns: { id: true, itemName: true, needType: true, isCustom: true },
      orderBy: (cn, { asc }) => asc(cn.itemName),
    }),
    db.query.dealConditions.findMany({
      where: (dc, { eq }) => eq(dc.dealId, id),
      orderBy: (dc, { asc }) => asc(dc.createdAt),
    }),
    db.query.dealClientNeeds.findMany({
      where: (dcn, { eq }) => eq(dcn.dealId, id),
      with: {
        documents: {
          columns: { id: true, fileName: true, mimeType: true, reviewStatus: true, rejectionNote: true },
          orderBy: (d, { asc }) => asc(d.createdAt),
        },
        answers: {
          columns: { id: true, questionText: true, answerText: true },
          orderBy: (a, { asc }) => asc(a.sortOrder),
        },
      },
      orderBy: (dcn, { asc }) => asc(dcn.createdAt),
    }),
    db.query.products.findMany({
      where: (p, { eq: eqP, and: andP }) => andP(eqP(p.category, deal.loanCategory), eqP(p.active, true)),
      with: { lender: true },
      orderBy: (p, { asc }) => asc(p.name),
    }),
    getAllProductOptions(),
  ]);

  const loanOfficers = allUsers.filter((u) => u.baseRole === "loan_officer");
  const processors = allUsers.filter((u) => u.baseRole === "processor");
  const assistants = allUsers.filter((u) => u.baseRole === "loan_officer_assistant");

  return (
    <LoanCenterTab
      dealId={deal.id}
      assignedLoanOfficerId={deal.assignedLoanOfficerId}
      assignedProcessorId={deal.assignedProcessorId}
      assignedAssistantId={deal.assignedAssistantId}
      loanOfficers={loanOfficers}
      processors={processors}
      assistants={assistants}
      followers={deal.followers}
      clientNeeds={clientNeeds}
      clientNeedsCatalog={clientNeedsCatalog}
      loanCategoryProducts={categoryProducts.map((p) => ({
        id: p.id,
        label: `${p.lender.name} — ${p.name}`,
      }))}
      allProducts={allProducts}
      currentProductId={deal.productId}
      hasBorrowerEmail={Boolean(deal.borrowerEmail)}
      remindersPaused={deal.clientNeedsRemindersPaused}
      reminderIntervalHours={deal.clientNeedsReminderIntervalHours}
      hasAcceptedProduct={Boolean(deal.productId)}
      conditions={conditions}
      notes={deal.notes}
      appraisalOrderedDate={deal.appraisalOrderedDate}
      creditPullDate={deal.creditPullDate}
      insuranceContactedDate={deal.insuranceContactedDate}
      titleOrderedDate={deal.titleOrderedDate}
      driveLink={deal.driveLink}
      titleCompanyAgentName={deal.titleCompanyAgentName}
      titleAgentEmail={deal.titleAgentEmail}
      titleAgentPhone={deal.titleAgentPhone}
      insuranceAgency={deal.insuranceAgency}
      insuranceAgentName={deal.insuranceAgentName}
      insuranceAgentEmail={deal.insuranceAgentEmail}
      insuranceAgentPhone={deal.insuranceAgentPhone}
    />
  );
}
