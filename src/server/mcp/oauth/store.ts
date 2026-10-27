// Persistence for the connector's OAuth server. The logic in flow.ts only sees
// this interface, so it is tested against an in-memory copy; DbOAuthStore is the
// real one. Codes, tokens and client secrets are stored only as SHA-256 hashes.

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { mcpOauthClients, mcpOauthCodes, mcpOauthTokens, users } from "@/server/db/schema";

export interface ClientRecord {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_post";
  clientSecretHash: string | null;
}

export interface CodeRecord {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  expiresAt: Date;
}

export interface GrantRecord {
  id: string;
  userId: string;
  clientId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  resource: string;
  scope: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  /** Looked up fresh on every use, so removing someone's admin rights cuts the connector off at once. */
  user: { name: string | null; email: string | null; isAdmin: boolean; active: boolean };
}

export type NewGrant = Omit<GrantRecord, "id" | "revokedAt" | "lastUsedAt" | "user" | "previousRefreshTokenHash">;

export interface OAuthStore {
  getClient(clientId: string): Promise<ClientRecord | null>;
  countClients(): Promise<number>;
  saveClient(client: ClientRecord): Promise<void>;
  saveCode(code: CodeRecord): Promise<void>;
  /** Marks the code used and returns it, only if it exists, is unused and unexpired. Atomic. */
  takeCode(codeHash: string, now: Date): Promise<CodeRecord | null>;
  createGrant(grant: NewGrant): Promise<void>;
  findGrantByAccessHash(hash: string): Promise<GrantRecord | null>;
  /** Matches the grant's current OR previous refresh token. */
  findGrantByRefreshHash(hash: string): Promise<GrantRecord | null>;
  rotateGrant(id: string, next: { accessTokenHash: string; refreshTokenHash: string; previousRefreshTokenHash: string; accessExpiresAt: Date; refreshExpiresAt: Date }): Promise<void>;
  revokeGrant(id: string, now: Date): Promise<void>;
  touchGrant(id: string, now: Date): Promise<void>;
}

const grantColumns = {
  id: mcpOauthTokens.id,
  userId: mcpOauthTokens.userId,
  clientId: mcpOauthTokens.clientId,
  accessTokenHash: mcpOauthTokens.accessTokenHash,
  refreshTokenHash: mcpOauthTokens.refreshTokenHash,
  previousRefreshTokenHash: mcpOauthTokens.previousRefreshTokenHash,
  resource: mcpOauthTokens.resource,
  scope: mcpOauthTokens.scope,
  accessExpiresAt: mcpOauthTokens.accessExpiresAt,
  refreshExpiresAt: mcpOauthTokens.refreshExpiresAt,
  revokedAt: mcpOauthTokens.revokedAt,
  lastUsedAt: mcpOauthTokens.lastUsedAt,
  userName: users.name,
  userEmail: users.email,
  userIsAdmin: users.isAdmin,
  userActive: users.active,
};

type GrantRow = Omit<typeof mcpOauthTokens.$inferSelect, "createdAt"> & {
  userName: string | null;
  userEmail: string | null;
  userIsAdmin: boolean;
  userActive: boolean;
};

function toGrant(row: GrantRow): GrantRecord {
  const { userName, userEmail, userIsAdmin, userActive, ...grant } = row;
  return { ...grant, user: { name: userName, email: userEmail, isAdmin: userIsAdmin, active: userActive } };
}

export const dbOAuthStore: OAuthStore = {
  async getClient(clientId) {
    const [row] = await db.select().from(mcpOauthClients).where(eq(mcpOauthClients.clientId, clientId)).limit(1);
    if (!row) return null;
    return {
      clientId: row.clientId,
      clientName: row.clientName,
      redirectUris: row.redirectUris,
      tokenEndpointAuthMethod: row.tokenEndpointAuthMethod === "client_secret_post" ? "client_secret_post" : "none",
      clientSecretHash: row.clientSecretHash,
    };
  },
  async countClients() {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(mcpOauthClients);
    return row?.n ?? 0;
  },
  async saveClient(c) {
    await db.insert(mcpOauthClients).values({
      clientId: c.clientId,
      clientName: c.clientName,
      redirectUris: c.redirectUris,
      tokenEndpointAuthMethod: c.tokenEndpointAuthMethod,
      clientSecretHash: c.clientSecretHash,
    });
  },
  async saveCode(c) {
    await db.insert(mcpOauthCodes).values(c);
  },
  async takeCode(codeHash, now) {
    const [row] = await db
      .update(mcpOauthCodes)
      .set({ usedAt: now })
      .where(and(eq(mcpOauthCodes.codeHash, codeHash), isNull(mcpOauthCodes.usedAt), gt(mcpOauthCodes.expiresAt, now)))
      .returning();
    if (!row) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { usedAt: _usedAt, ...code } = row;
    return code;
  },
  async createGrant(g) {
    await db.insert(mcpOauthTokens).values(g);
  },
  async findGrantByAccessHash(hash) {
    const [row] = await db.select(grantColumns).from(mcpOauthTokens).innerJoin(users, eq(users.id, mcpOauthTokens.userId)).where(eq(mcpOauthTokens.accessTokenHash, hash)).limit(1);
    return row ? toGrant(row) : null;
  },
  async findGrantByRefreshHash(hash) {
    const [row] = await db
      .select(grantColumns)
      .from(mcpOauthTokens)
      .innerJoin(users, eq(users.id, mcpOauthTokens.userId))
      .where(or(eq(mcpOauthTokens.refreshTokenHash, hash), eq(mcpOauthTokens.previousRefreshTokenHash, hash)))
      .limit(1);
    return row ? toGrant(row) : null;
  },
  async rotateGrant(id, next) {
    await db.update(mcpOauthTokens).set({ ...next, lastUsedAt: new Date() }).where(eq(mcpOauthTokens.id, id));
  },
  async revokeGrant(id, now) {
    await db.update(mcpOauthTokens).set({ revokedAt: now }).where(and(eq(mcpOauthTokens.id, id), isNull(mcpOauthTokens.revokedAt)));
  },
  async touchGrant(id, now) {
    await db.update(mcpOauthTokens).set({ lastUsedAt: now }).where(eq(mcpOauthTokens.id, id));
  },
};
