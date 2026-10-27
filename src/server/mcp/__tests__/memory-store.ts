import { randomUUID } from "node:crypto";
import type { ClientRecord, CodeRecord, GrantRecord, NewGrant, OAuthStore } from "../oauth/store";

export interface MemoryUser {
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  active: boolean;
}

/** In-memory OAuthStore with the same semantics as the database one. */
export class MemoryStore implements OAuthStore {
  clients = new Map<string, ClientRecord>();
  codes = new Map<string, CodeRecord & { usedAt: Date | null }>();
  grants = new Map<string, GrantRecord>();
  users = new Map<string, MemoryUser>();
  touched: string[] = [];

  addUser(id: string, user: Partial<MemoryUser> = {}) {
    this.users.set(id, { name: "Justin Barber", email: "justin@example.com", isAdmin: true, active: true, ...user });
  }

  async getClient(id: string) {
    return this.clients.get(id) ?? null;
  }
  async countClients() {
    return this.clients.size;
  }
  async saveClient(c: ClientRecord) {
    this.clients.set(c.clientId, c);
  }
  async saveCode(c: CodeRecord) {
    this.codes.set(c.codeHash, { ...c, usedAt: null });
  }
  async takeCode(hash: string, now: Date) {
    const c = this.codes.get(hash);
    if (!c || c.usedAt || c.expiresAt <= now) return null;
    c.usedAt = now;
    const { usedAt: _u, ...rest } = c;
    return rest;
  }
  async createGrant(g: NewGrant) {
    const user = this.users.get(g.userId);
    if (!user) throw new Error("unknown user");
    const id = randomUUID();
    this.grants.set(id, { ...g, id, previousRefreshTokenHash: null, revokedAt: null, lastUsedAt: null, user });
  }
  async findGrantByAccessHash(hash: string) {
    return this.refresh([...this.grants.values()].find((g) => g.accessTokenHash === hash));
  }
  async findGrantByRefreshHash(hash: string) {
    return this.refresh([...this.grants.values()].find((g) => g.refreshTokenHash === hash || g.previousRefreshTokenHash === hash));
  }
  async rotateGrant(id: string, next: { accessTokenHash: string; refreshTokenHash: string; previousRefreshTokenHash: string; accessExpiresAt: Date; refreshExpiresAt: Date }) {
    Object.assign(this.grants.get(id)!, next);
  }
  async revokeGrant(id: string, now: Date) {
    const g = this.grants.get(id);
    if (g && !g.revokedAt) g.revokedAt = now;
  }
  async touchGrant(id: string, now: Date) {
    this.touched.push(id);
    this.grants.get(id)!.lastUsedAt = now;
  }

  // The user row is read fresh, like the database join does.
  private refresh(g: GrantRecord | undefined) {
    if (!g) return null;
    return { ...g, user: this.users.get(g.userId)! };
  }
}
