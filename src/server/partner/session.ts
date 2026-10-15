import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { partnerSessions, referralAffiliates } from "@/server/db/schema";
import { hashToken, newToken } from "@/server/partner/crypto";
import { TERMS_VERSION } from "@/lib/partner-terms";

const COOKIE = "partner_session";
const SESSION_DAYS = 90; // so a phone stays signed in

export type Partner = typeof referralAffiliates.$inferSelect;

export async function createPartnerSession(partnerId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(partnerSessions).values({ partnerId, tokenHash: hashToken(token), expiresAt });
  await db.update(referralAffiliates).set({ lastLoginAt: new Date() }).where(eq(referralAffiliates.id, partnerId));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyPartnerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(partnerSessions).where(eq(partnerSessions.tokenHash, hashToken(token)));
  jar.delete(COOKIE);
}

/** The signed-in partner, or null. Every portal query is scoped by this partner's id. */
export async function getSessionPartner(): Promise<Partner | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.query.partnerSessions.findFirst({
    where: and(eq(partnerSessions.tokenHash, hashToken(token)), gt(partnerSessions.expiresAt, new Date())),
  });
  if (!session) return null;
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, session.partnerId) });
  return partner ?? null;
}

/**
 * Guards a portal page. A partner whose profile or terms acceptance isn't done
 * (or whose terms version is out of date) is sent to the terms step first.
 */
export async function requirePartner({ allowTermsPending = false }: { allowTermsPending?: boolean } = {}): Promise<Partner> {
  const partner = await getSessionPartner();
  if (!partner) redirect("/partner/sign-in");
  if (!allowTermsPending && (partner.status !== "active" || partner.termsVersion !== TERMS_VERSION)) {
    redirect("/partner/terms");
  }
  return partner;
}
