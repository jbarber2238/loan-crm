import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getDealDetail } from "@/server/data/deal-detail";
import { getAllProductOptions } from "@/server/actions/client-need-catalog";
import { requireUser } from "@/server/auth/guards";
import { getDealRoomId } from "@/server/actions/team-chat";
import { TeamChatPanel } from "@/components/team-chat/team-chat-panel";
import { LoanCenterTab } from "@/components/deals/loan-center-tab";

export default async function DealLoanCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const teamChatRoomId = await getDealRoomId(id);
  const user = await requireUser();
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
          columns: {
            id: true,
            fileName: true,
            mimeType: true,
            reviewStatus: true,
            rejectionNote: true,
            aiReviewFlags: true,
            aiReviewedAt: true,
          },
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
      initialTab={tab}
      teamChat={
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Internal only — the borrower never sees this. Client texts live under Communications.
          </p>
          {teamChatRoomId ? (
            <TeamChatPanel roomId={teamChatRoomId} />
          ) : (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              You&apos;re not on this deal&apos;s chat. Ask its loan officer or an admin to add you.
            </p>
          )}
        </div>
      }
      dealId={deal.id}
      loanCategory={deal.loanCategory}
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
      notes={deal.notes.map((n) => ({
        ...n,
        canDelete: n.authorUserId === user.id || user.isAdmin,
      }))}
      creditPullDate={deal.creditPullDate}
      driveLink={deal.driveLink}
      titleCompanyAgentName={deal.titleCompanyAgentName}
      titleCompanyName={deal.titleCompanyName}
      titleAgentEmail={deal.titleAgentEmail}
      titleAgentPhone={deal.titleAgentPhone}
      insuranceAgency={deal.insuranceAgency}
      insuranceAgentName={deal.insuranceAgentName}
      insuranceAgentEmail={deal.insuranceAgentEmail}
      insuranceAgentPhone={deal.insuranceAgentPhone}
      insuranceContactNotes={deal.insuranceContactNotes}
      interiorAccessContactRelationship={deal.interiorAccessContactRelationship}
      interiorAccessContactName={deal.interiorAccessContactName}
      interiorAccessContactEmail={deal.interiorAccessContactEmail}
      interiorAccessContactPhone={deal.interiorAccessContactPhone}
      interiorAccessLockBoxInfo={deal.interiorAccessLockBoxInfo}
      appraisalNotes={deal.appraisalNotes}
      insuranceNotes={deal.insuranceNotes}
      titleNotes={deal.titleNotes}
      keyDateEvents={deal.keyDateEvents.map((e) => ({
        id: e.id,
        item: e.item,
        status: e.status,
        eventDate: e.eventDate,
        createdAt: e.createdAt,
        createdByName: e.createdBy?.name ?? null,
      }))}
      appraisalDocumentFileName={deal.appraisalDocumentFileName}
    />
  );
}
