"use server";

import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import {
  dealConversations,
  dealConversationParticipants,
  dealMessages,
  dealCallLogs,
  deals,
  lenderReps,
  referralAffiliates,
  otherContacts,
} from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendSms, toE164 } from "@/server/twilio-client";
import { getOrCreateConversationForPhone } from "@/server/conversations";
import { STAGES, labelFor } from "@/lib/labels";
import { ARCHIVABLE_STAGES, ARCHIVE_AFTER_DAYS_IN_STAGE } from "@/lib/deal-pipeline";

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** The floating chat dock's own data fetch — same shape the Inbox conversation page reads, just returned to a client component instead of rendered server-side. */
export async function getConversationForDock(conversationId: string) {
  await requireUser();
  const conversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.id, conversationId),
    with: {
      messages: { orderBy: (m, { asc }) => asc(m.createdAt) },
      callLogs: { orderBy: (c, { asc }) => asc(c.startedAt) },
      participants: true,
    },
  });
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

export type ContactType = "Borrower" | "Insurance" | "Title" | "Lender Rep" | "Referral Partner" | "Other";

export interface ContactSearchResult {
  key: string;
  name: string;
  phone: string;
  contactType: ContactType;
  subtitle: string;
  /** Only set for a deal-specific contact (Borrower/Insurance/Title) — lets prepareContactConversation prepend the "Regarding your deal..." opener. */
  dealId?: string;
}

/**
 * Global "New Message" search, across every kind of contact this app
 * already knows a phone number for — Borrower/Insurance/Title come from
 * deals (that's where those contacts have always lived, one per deal, no
 * separate directory needed), Lender Rep and Referral Partner from their
 * own tables, and "Other" from the small catch-all table for anyone who
 * doesn't fit those. Opening a result reuses that phone number's one
 * shared conversation, same as everywhere else in this app.
 */
export async function searchContacts(query: string): Promise<ContactSearchResult[]> {
  await requireUser();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const like = `%${trimmed}%`;
  const lower = trimmed.toLowerCase();

  const [dealRows, lenderRepRows, affiliateRows, otherRows] = await Promise.all([
    db.query.deals.findMany({
      where: (d, { and: andD, isNull: isNullD }) =>
        andD(
          isNullD(d.deletedAt),
          or(ilike(d.borrowerName, like), ilike(d.insuranceAgentName, like), ilike(d.titleCompanyAgentName, like))
        ),
      columns: {
        id: true,
        borrowerName: true,
        borrowerPhone: true,
        insuranceAgentName: true,
        insuranceAgentPhone: true,
        titleCompanyAgentName: true,
        titleAgentPhone: true,
        propertyAddress: true,
        stage: true,
      },
      orderBy: (d, { desc: descD }) => descD(d.createdAt),
      limit: 25,
    }),
    db.query.lenderReps.findMany({
      where: ilike(lenderReps.name, like),
      columns: { id: true, name: true, phone: true },
      with: { lender: { columns: { name: true } } },
      limit: 10,
    }),
    db.query.referralAffiliates.findMany({
      where: ilike(referralAffiliates.name, like),
      columns: { id: true, name: true, phone: true },
      limit: 10,
    }),
    db.query.otherContacts.findMany({
      where: ilike(otherContacts.name, like),
      columns: { id: true, name: true, phone: true, notes: true },
      limit: 10,
    }),
  ]);

  const results: ContactSearchResult[] = [];
  for (const d of dealRows) {
    const stageLabel = labelFor(STAGES, d.stage);
    if (d.borrowerName?.toLowerCase().includes(lower) && d.borrowerPhone) {
      results.push({
        key: `borrower-${d.id}`,
        name: d.borrowerName,
        phone: d.borrowerPhone,
        contactType: "Borrower",
        dealId: d.id,
        subtitle: `${d.propertyAddress} · ${stageLabel}`,
      });
    }
    if (d.insuranceAgentName?.toLowerCase().includes(lower) && d.insuranceAgentPhone) {
      results.push({
        key: `insurance-${d.id}`,
        name: d.insuranceAgentName,
        phone: d.insuranceAgentPhone,
        contactType: "Insurance",
        dealId: d.id,
        subtitle: `${d.propertyAddress} (${d.borrowerName})`,
      });
    }
    if (d.titleCompanyAgentName?.toLowerCase().includes(lower) && d.titleAgentPhone) {
      results.push({
        key: `title-${d.id}`,
        name: d.titleCompanyAgentName,
        phone: d.titleAgentPhone,
        contactType: "Title",
        dealId: d.id,
        subtitle: `${d.propertyAddress} (${d.borrowerName})`,
      });
    }
  }
  for (const r of lenderRepRows) {
    if (!r.phone) continue;
    results.push({ key: `lenderrep-${r.id}`, name: r.name, phone: r.phone, contactType: "Lender Rep", subtitle: r.lender.name });
  }
  for (const a of affiliateRows) {
    if (!a.phone || !a.name) continue;
    results.push({ key: `affiliate-${a.id}`, name: a.name, phone: a.phone, contactType: "Referral Partner", subtitle: "Referral partner" });
  }
  for (const o of otherRows) {
    results.push({ key: `other-${o.id}`, name: o.name, phone: o.phone, contactType: "Other", subtitle: o.notes ?? "" });
  }

  return results.slice(0, 20);
}

/** Opens (or creates) the one shared conversation for any contact-search result — the deal-specific opener only applies when this contact is tied to one particular deal (a borrower, or that deal's insurance/title agent). */
export async function prepareContactConversation(input: { phone: string; dealId?: string }) {
  await requireUser();
  let opener = "";
  if (input.dealId) {
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, input.dealId), columns: { propertyAddress: true } });
    if (deal) opener = `Regarding your deal located at ${deal.propertyAddress}:\n\n`;
  }
  const conversation = await getOrCreateConversationForPhone(input.phone, input.dealId);
  return { conversationId: conversation.id, phone: conversation.primaryPhone, initialBody: opener };
}

/** Marks every unread inbound message and unreviewed voicemail/missed call in a conversation as seen — called when a chat window (or the Communications page) opens it. */
export async function markConversationRead(conversationId: string) {
  await requireUser();
  const now = new Date();
  await Promise.all([
    db
      .update(dealMessages)
      .set({ readAt: now })
      .where(and(eq(dealMessages.conversationId, conversationId), eq(dealMessages.direction, "inbound"), isNull(dealMessages.readAt))),
    db
      .update(dealCallLogs)
      .set({ reviewedAt: now })
      .where(and(eq(dealCallLogs.conversationId, conversationId), eq(dealCallLogs.direction, "inbound"), isNull(dealCallLogs.reviewedAt))),
  ]);
}

/** Every conversation-id that currently has an unread inbound text or an unreviewed inbound call/voicemail — used to badge the Communications list. */
async function conversationIdsWithUnread(): Promise<Set<string>> {
  const [unreadMessages, unreviewedCalls] = await Promise.all([
    db
      .selectDistinct({ conversationId: dealMessages.conversationId })
      .from(dealMessages)
      .where(and(eq(dealMessages.direction, "inbound"), isNull(dealMessages.readAt))),
    db
      .selectDistinct({ conversationId: dealCallLogs.conversationId })
      .from(dealCallLogs)
      .where(and(eq(dealCallLogs.direction, "inbound"), isNull(dealCallLogs.reviewedAt))),
  ]);
  return new Set([...unreadMessages, ...unreviewedCalls].map((r) => r.conversationId));
}

/** Every conversation, matched or not, for the Communications page's list — most recently active first. */
export async function getAllConversations() {
  await requireUser();
  const [conversations, unreadIds] = await Promise.all([
    db.query.dealConversations.findMany({
      with: {
        messages: { orderBy: desc(dealMessages.createdAt), limit: 1 },
        callLogs: { orderBy: (c, { desc: descC }) => descC(c.startedAt), limit: 1 },
        participants: true,
      },
      orderBy: desc(dealConversations.lastMessageAt),
    }),
    conversationIdsWithUnread(),
  ]);

  const phones = conversations.map((c) => c.primaryPhone);
  const dealNames = phones.length
    ? await db.query.deals.findMany({
        where: inArray(deals.borrowerPhone, phones),
        columns: { borrowerPhone: true, borrowerName: true },
      })
    : [];
  const nameByPhone = new Map(dealNames.map((d) => [d.borrowerPhone, d.borrowerName]));

  return conversations.map((c) => ({
    ...c,
    displayName: nameByPhone.get(c.primaryPhone) ?? c.primaryPhone,
    hasUnread: unreadIds.has(c.id),
  }));
}

/** Same send, for an Inbox conversation not (yet) tied to any deal. */
export async function sendConversationMessage(conversationId: string, formData: FormData) {
  const user = await requireUser();
  const body = str(formData, "body");
  if (!body) throw new Error("Message can't be empty");

  await sendToConversation(conversationId, body, user.id);

  revalidatePath("/inbox");
}

async function sendToConversation(conversationId: string, body: string, sentByUserId: string) {
  const conversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.id, conversationId),
    with: { participants: true },
  });
  if (!conversation) throw new Error("Conversation not found");

  const recipients = [conversation.primaryPhone, ...conversation.participants.map((p) => p.phone)];
  const statusCallbackUrl = `${baseUrl()}/api/webhooks/twilio-sms-status`;

  for (const rawTo of recipients) {
    const to = toE164(rawTo);
    const result = await sendSms({ to, body, statusCallbackUrl });
    await db.insert(dealMessages).values({
      conversationId,
      direction: "outbound",
      body,
      fromNumber: result.from,
      toNumber: to,
      sentByUserId,
      twilioSid: result.sid,
      status: result.status,
    });
  }

  await db.update(dealConversations).set({ lastMessageAt: new Date() }).where(eq(dealConversations.id, conversationId));
}

/** Adds an ad-hoc extra recipient (a co-signer, a spouse) to one conversation — not a permanent deal field, see the plan doc. */
export async function addConversationParticipant(conversationId: string, formData: FormData) {
  await requireUser();
  const name = str(formData, "name") || null;
  const phone = str(formData, "phone");
  if (!phone) throw new Error("Phone number is required");

  await db.insert(dealConversationParticipants).values({ conversationId, name, phone });
  revalidatePath(`/deals`);
  revalidatePath("/inbox");
}

export async function removeConversationParticipant(participantId: string) {
  await requireUser();
  await db.delete(dealConversationParticipants).where(eq(dealConversationParticipants.id, participantId));
  revalidatePath(`/deals`);
  revalidatePath("/inbox");
}

/** Attaches an Inbox conversation to an existing deal — an existing borrower who called/texted from a number that wasn't on file. */
export async function attachConversationToDeal(conversationId: string, formData: FormData) {
  await requireUser();
  const dealId = str(formData, "dealId");
  if (!dealId) throw new Error("Choose a deal to attach this to");
  await db.update(dealConversations).set({ dealId }).where(eq(dealConversations.id, conversationId));
  revalidatePath("/inbox");
  revalidatePath(`/deals/${dealId}`);
}

/** Un-attaches (back to the Inbox) — for the rare mis-click. */
export async function detachConversationFromDeal(conversationId: string) {
  await requireUser();
  await db.update(dealConversations).set({ dealId: null }).where(eq(dealConversations.id, conversationId));
  revalidatePath("/inbox");
}

export interface ContactDealSummary {
  id: string;
  loanNumber: number | null;
  propertyAddress: string;
  stage: string;
}

/** The Communications page's info panel: every deal this phone number is the BORROWER on, grouped the same way Justin actually thinks about it — still active, or closed/lost recently enough to still be a live conversation topic. */
export async function getContactDealsContext(phone: string) {
  await requireUser();
  const normalized = toE164(phone);
  const matched = await db.query.deals.findMany({
    where: and(eq(deals.borrowerPhone, normalized), isNull(deals.deletedAt)),
    columns: { id: true, loanNumber: true, propertyAddress: true, stage: true, updatedAt: true },
    orderBy: (d, { desc: descD }) => descD(d.createdAt),
  });

  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS_IN_STAGE * 24 * 60 * 60 * 1000);
  const toSummary = (d: (typeof matched)[number]): ContactDealSummary => ({
    id: d.id,
    loanNumber: d.loanNumber,
    propertyAddress: d.propertyAddress,
    stage: d.stage,
  });

  return {
    active: matched.filter((d) => !ARCHIVABLE_STAGES.has(d.stage) && d.stage !== "disqualified").map(toSummary),
    closedRecent: matched.filter((d) => d.stage === "closed" && d.updatedAt >= cutoff).map(toSummary),
    lostRecent: matched
      .filter((d) => (d.stage === "lost" || d.stage === "disqualified") && d.updatedAt >= cutoff)
      .map(toSummary),
  };
}

export interface DirectoryContact {
  key: string;
  name: string;
  phone: string;
  email: string | null;
  contactType: ContactType;
  subtitle: string;
  dealId?: string;
  /** Only meaningful for Borrower — the intake form's own consent checkbox ("I consent to receive emails and text messages..."). null = never asked/unknown, not "no." */
  consent: boolean | null;
}

/**
 * The full Contacts Directory — every contact this app already has a phone
 * number for, one row per unique number (a borrower or lender rep on
 * several deals still shows up once). Same four real sources as
 * searchContacts, just unfiltered and merged instead of query-matched.
 */
export async function getAllContacts(): Promise<DirectoryContact[]> {
  await requireUser();

  const [dealRows, lenderRepRows, affiliateRows, otherRows] = await Promise.all([
    db.query.deals.findMany({
      where: isNull(deals.deletedAt),
      columns: {
        id: true,
        borrowerName: true,
        borrowerPhone: true,
        borrowerEmail: true,
        marketingConsent: true,
        insuranceAgentName: true,
        insuranceAgentPhone: true,
        insuranceAgentEmail: true,
        titleCompanyAgentName: true,
        titleAgentPhone: true,
        titleAgentEmail: true,
        propertyAddress: true,
        stage: true,
      },
      orderBy: (d, { desc: descD }) => descD(d.createdAt),
    }),
    db.query.lenderReps.findMany({
      columns: { id: true, name: true, phone: true, email: true },
      with: { lender: { columns: { name: true } } },
    }),
    db.query.referralAffiliates.findMany({ columns: { id: true, name: true, phone: true, email: true } }),
    db.query.otherContacts.findMany({ columns: { id: true, name: true, phone: true, notes: true } }),
  ]);

  const byPhone = new Map<string, DirectoryContact>();
  function upsert(c: DirectoryContact) {
    const existing = byPhone.get(c.phone);
    if (!existing) {
      byPhone.set(c.phone, c);
      return;
    }
    if (c.consent) existing.consent = true;
    if (!existing.email && c.email) existing.email = c.email;
  }

  for (const d of dealRows) {
    const stageLabel = labelFor(STAGES, d.stage);
    if (d.borrowerPhone) {
      upsert({
        key: `borrower-${d.id}`,
        name: d.borrowerName,
        phone: d.borrowerPhone,
        email: d.borrowerEmail,
        contactType: "Borrower",
        dealId: d.id,
        subtitle: `${d.propertyAddress} · ${stageLabel}`,
        consent: d.marketingConsent ?? null,
      });
    }
    if (d.insuranceAgentPhone && d.insuranceAgentName) {
      upsert({
        key: `insurance-${d.id}`,
        name: d.insuranceAgentName,
        phone: d.insuranceAgentPhone,
        email: d.insuranceAgentEmail,
        contactType: "Insurance",
        dealId: d.id,
        subtitle: `${d.propertyAddress} (${d.borrowerName})`,
        consent: null,
      });
    }
    if (d.titleAgentPhone && d.titleCompanyAgentName) {
      upsert({
        key: `title-${d.id}`,
        name: d.titleCompanyAgentName,
        phone: d.titleAgentPhone,
        email: d.titleAgentEmail,
        contactType: "Title",
        dealId: d.id,
        subtitle: `${d.propertyAddress} (${d.borrowerName})`,
        consent: null,
      });
    }
  }
  for (const r of lenderRepRows) {
    if (!r.phone) continue;
    upsert({ key: `lenderrep-${r.id}`, name: r.name, phone: r.phone, email: r.email, contactType: "Lender Rep", subtitle: r.lender.name, consent: null });
  }
  for (const a of affiliateRows) {
    if (!a.phone || !a.name) continue;
    upsert({ key: `affiliate-${a.id}`, name: a.name, phone: a.phone, email: a.email, contactType: "Referral Partner", subtitle: "Referral partner", consent: null });
  }
  for (const o of otherRows) {
    upsert({ key: `other-${o.id}`, name: o.name, phone: o.phone, email: null, contactType: "Other", subtitle: o.notes ?? "", consent: null });
  }

  return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name));
}
