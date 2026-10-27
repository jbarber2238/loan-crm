import { beforeEach, describe, expect, it } from "vitest";
import type { AuditSink } from "../audit";
import { handleMcpHttp, type McpHttpDeps } from "../http";
import { sha256Hex } from "../oauth/crypto";
import { NOW, fakeData } from "./fixtures";
import { MemoryStore } from "./memory-store";

const ORIGIN = "https://crm.example.com";
const TOKEN = "good-token";

interface LogRow {
  id: string;
  userId: string;
  tool: string;
  args: unknown;
  ok: boolean | null;
  error: string | null;
  order: number;
}

function setup(over: { failAudit?: boolean } = {}) {
  const store = new MemoryStore();
  store.addUser("u-justin");
  void store.saveClient({ clientId: "client-1", clientName: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"], tokenEndpointAuthMethod: "none", clientSecretHash: null });
  void store.createGrant({
    userId: "u-justin",
    clientId: "client-1",
    accessTokenHash: sha256Hex(TOKEN),
    refreshTokenHash: sha256Hex("refresh"),
    resource: `${ORIGIN}/mcp`,
    scope: "mcp:read",
    accessExpiresAt: new Date(NOW.getTime() + 3_600_000),
    refreshExpiresAt: new Date(NOW.getTime() + 86_400_000),
  });
  const events: string[] = [];
  const log: LogRow[] = [];
  const audit: AuditSink = {
    async begin({ auth, tool, args }) {
      if (over.failAudit) throw new Error("audit table down");
      events.push(`audit:${tool}`);
      const row: LogRow = { id: `a${log.length}`, userId: auth.userId, tool, args, ok: null, error: null, order: log.length };
      log.push(row);
      return row.id;
    },
    async finish(id, outcome) {
      const row = log.find((r) => r.id === id)!;
      row.ok = outcome.ok;
      row.error = outcome.error;
    },
  };
  const data = fakeData();
  const deps: McpHttpDeps = {
    store,
    audit,
    origin: ORIGIN,
    now: () => NOW,
    run: (fn) => {
      events.push("run");
      return fn(data);
    },
  };
  return { store, deps, log, events, data };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify(body),
  });
}
const call = (name: string, args: unknown = {}, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("authentication", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("answers 401 with the discovery pointer when there is no token", async () => {
    const res = await handleMcpHttp(post(call("pipeline_summary"), { Authorization: "" }), ctx.deps);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
    expect(ctx.events).toEqual([]);
  });

  it("refuses an unknown, expired, revoked or wrong-audience token", async () => {
    expect((await handleMcpHttp(post(call("pipeline_summary"), { Authorization: "Bearer nope" }), ctx.deps)).status).toBe(401);

    const grant = [...ctx.store.grants.values()][0];
    grant.accessExpiresAt = new Date(NOW.getTime() - 1);
    expect((await handleMcpHttp(post(call("pipeline_summary")), ctx.deps)).status).toBe(401);
    grant.accessExpiresAt = new Date(NOW.getTime() + 1000);

    grant.resource = "https://other.example.com/mcp";
    expect((await handleMcpHttp(post(call("pipeline_summary")), ctx.deps)).status).toBe(401);
    grant.resource = `${ORIGIN}/mcp`;

    grant.revokedAt = NOW;
    const revoked = await handleMcpHttp(post(call("pipeline_summary")), ctx.deps);
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get("www-authenticate")).toContain("invalid_token");
    expect(ctx.log).toEqual([]);
  });

  it("stops working the moment the approving user is no longer an active admin", async () => {
    expect((await handleMcpHttp(post(call("pipeline_summary")), ctx.deps)).status).toBe(200);
    ctx.store.users.get("u-justin")!.isAdmin = false;
    expect((await handleMcpHttp(post(call("pipeline_summary")), ctx.deps)).status).toBe(401);
    ctx.store.users.get("u-justin")!.isAdmin = true;
    ctx.store.users.get("u-justin")!.active = false;
    expect((await handleMcpHttp(post(call("pipeline_summary")), ctx.deps)).status).toBe(401);
  });

  it("refuses a token without the read scope", async () => {
    [...ctx.store.grants.values()][0].scope = "mcp:write";
    expect((await handleMcpHttp(post(call("pipeline_summary")), ctx.deps)).status).toBe(401);
  });

  it("refuses browser requests from other origins", async () => {
    const res = await handleMcpHttp(post(call("pipeline_summary"), { Origin: "https://evil.example.com" }), ctx.deps);
    expect(res.status).toBe(403);
    expect((await handleMcpHttp(post(call("pipeline_summary"), { Origin: "https://claude.ai" }), ctx.deps)).status).toBe(200);
  });

  it("refuses GET and DELETE (no server-push stream, no sessions)", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await handleMcpHttp(new Request(`${ORIGIN}/mcp`, { method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: "text/event-stream" } }), ctx.deps);
      expect(res.status).toBe(405);
    }
  });

  it("answers CORS preflight without needing a token", async () => {
    const res = await handleMcpHttp(new Request(`${ORIGIN}/mcp`, { method: "OPTIONS" }), ctx.deps);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});

describe("protocol", () => {
  it("initializes and lists the five tools", async () => {
    const { deps } = setup();
    const init = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }), deps);
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("manna-crm");
    const list = await handleMcpHttp(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }), deps);
    expect((await list.json()).result.tools).toHaveLength(5);
  });

  it("rejects malformed JSON", async () => {
    const { deps } = setup();
    const res = await handleMcpHttp(new Request(`${ORIGIN}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${TOKEN}` }, body: "{nope" }), deps);
    expect(res.status).toBe(400);
  });
});

describe("audit log", () => {
  it("records user, tool and arguments BEFORE the tool runs, then the outcome", async () => {
    const { deps, log, events } = setup();
    const res = await handleMcpHttp(post(call("list_open_loans", { assigned_to: "pat", limit: 5 })), deps);
    expect(res.status).toBe(200);
    expect(events).toEqual(["audit:list_open_loans", "run"]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ userId: "u-justin", tool: "list_open_loans", args: { assigned_to: "pat", limit: 5 }, ok: true, error: null });
  });

  it("logs failed calls as failed", async () => {
    const { deps, log } = setup();
    await handleMcpHttp(post(call("get_loan", { loan_id: "9999" })), deps);
    expect(log[0]).toMatchObject({ tool: "get_loan", ok: false });
    expect(log[0].error).toMatch(/No loan found/);
  });

  it("logs a write attempt, rejects it, and runs nothing", async () => {
    const { deps, log, events, data } = setup();
    const res = await handleMcpHttp(post(call("update_loan", { loan_id: "1001", stage: "closed" })), deps);
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tool: "update_loan", args: { loan_id: "1001", stage: "closed" }, ok: false });
    expect(events).toEqual(["audit:update_loan"]);
    expect(data.calls).toEqual([]);
  });

  it("logs every call in a batch", async () => {
    const { deps, log } = setup();
    await handleMcpHttp(post([call("pipeline_summary", {}, 1), call("send_email", { to: "x@y.z" }, 2)]), deps);
    expect(log.map((l) => [l.tool, l.ok])).toEqual([["pipeline_summary", true], ["send_email", false]]);
  });

  it("does not log discovery requests, only tool calls", async () => {
    const { deps, log } = setup();
    await handleMcpHttp(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }), deps);
    expect(log).toEqual([]);
  });

  it("fails closed: if the log cannot be written, the tool does not run", async () => {
    const { deps, events } = setup({ failAudit: true });
    const res = await handleMcpHttp(post(call("pipeline_summary")), deps);
    expect(res.status).toBe(500);
    expect(events).not.toContain("run");
  });
});
