import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { partnerTokens, referralAffiliates } from "@/server/db/schema";
import { hashToken } from "@/server/partner/crypto";
import { createPartnerSession } from "@/server/partner/session";
import { appUrl } from "@/server/partner/email";

// The emailed sign-in link (the forgot-password path): single use, 15 minutes.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await db.query.partnerTokens.findFirst({
    where: and(
      eq(partnerTokens.tokenHash, hashToken(token)),
      eq(partnerTokens.purpose, "login"),
      isNull(partnerTokens.usedAt),
      gt(partnerTokens.expiresAt, new Date())
    ),
  });
  const origin = appUrl();
  if (!row) return Response.redirect(`${origin}/partner/sign-in?expired=1`, 302);

  await db.update(partnerTokens).set({ usedAt: new Date() }).where(eq(partnerTokens.id, row.id));
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, row.partnerId), columns: { id: true } });
  if (!partner) return Response.redirect(`${origin}/partner/sign-in`, 302);

  await createPartnerSession(partner.id);
  return Response.redirect(`${origin}/partner`, 302);
}
