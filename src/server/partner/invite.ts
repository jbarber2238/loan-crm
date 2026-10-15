import { db } from "@/server/db/client";
import { partnerTokens } from "@/server/db/schema";
import { hashToken, newToken } from "@/server/partner/crypto";
import { INVITE_LINK_DAYS } from "@/lib/partner-constants";

/** A fresh single-use invite link token (the raw token goes in the email; only its hash is stored). */
export async function createInviteToken(partnerId: string): Promise<string> {
  const token = newToken();
  await db.insert(partnerTokens).values({
    partnerId,
    purpose: "invite",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_LINK_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}
