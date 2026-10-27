import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { isAllowedMcpOrigin, isAllowedRedirectUri } from "../oauth/config";
import { pkceMatches, sha256Hex } from "../oauth/crypto";
import { approveAuthorization, authenticateBearer, checkAuthorizeRequest, denyAuthorization, exchangeToken, isFailure, registerClient, revokeToken, type AuthorizeRequest } from "../oauth/flow";
import { NOW } from "./fixtures";
import { MemoryStore } from "./memory-store";

const ORIGIN = "https://crm.example.com";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.addUser("u-justin");
});

async function registered() {
  const result = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] }, store);
  if (isFailure(result)) throw new Error(result.error_description);
  return result.body.client_id as string;
}

async function approved(clientId: string): Promise<{ code: string; request: AuthorizeRequest }> {
  const check = await checkAuthorizeRequest(
    { client_id: clientId, redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256", state: "xyz" },
    store,
    ORIGIN
  );
  if (!check.ok) throw new Error("check failed");
  const url = new URL(await approveAuthorization(check.request, "u-justin", store, NOW));
  expect(url.origin + url.pathname).toBe(REDIRECT);
  expect(url.searchParams.get("state")).toBe("xyz");
  return { code: url.searchParams.get("code")!, request: check.request };
}

const form = (o: Record<string, string>) => new URLSearchParams(o);
const tokenRequest = (clientId: string, code: string, extra: Record<string, string> = {}) =>
  form({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER, ...extra });

describe("redirect and origin rules", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", true],
    ["https://claude.com/api/mcp/auth_callback", true],
    ["http://localhost:6274/oauth/callback", true],
    ["http://127.0.0.1:3000/cb", true],
    ["https://evil.example.com/cb", false],
    ["http://claude.ai/cb", false],
    ["https://claude.ai.evil.com/cb", false],
    ["https://claude.ai/cb#frag", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
  ])("redirect %s allowed=%s", (uri, allowed) => {
    expect(isAllowedRedirectUri(uri)).toBe(allowed);
  });

  it("allows only Claude, the app itself and loopback as browser origins", () => {
    expect(isAllowedMcpOrigin("https://claude.ai", ORIGIN)).toBe(true);
    expect(isAllowedMcpOrigin(ORIGIN, ORIGIN)).toBe(true);
    expect(isAllowedMcpOrigin("http://localhost:6274", ORIGIN)).toBe(true);
    expect(isAllowedMcpOrigin("https://evil.com", ORIGIN)).toBe(false);
  });
});

describe("pkce", () => {
  it("matches S256 only", () => {
    expect(pkceMatches(VERIFIER, CHALLENGE)).toBe(true);
    expect(pkceMatches(VERIFIER, VERIFIER)).toBe(false);
    expect(pkceMatches("short", CHALLENGE)).toBe(false);
    expect(pkceMatches(VERIFIER.replace("d", "e"), CHALLENGE)).toBe(false);
  });
});

describe("dynamic client registration", () => {
  it("registers a public client for claude.ai", async () => {
    const result = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }, store);
    expect(isFailure(result)).toBe(false);
    if (isFailure(result)) return;
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ token_endpoint_auth_method: "none", scope: "mcp:read", redirect_uris: [REDIRECT] });
    expect(result.body).not.toHaveProperty("client_secret");
  });

  it("issues a secret (stored hashed) to a confidential client", async () => {
    const result = await registerClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" }, store);
    if (isFailure(result)) throw new Error("unexpected");
    const secret = result.body.client_secret as string;
    expect(secret).toBeTruthy();
    expect(store.clients.get(result.body.client_id as string)?.clientSecretHash).toBe(sha256Hex(secret));
  });

  it("refuses redirects outside the allow-list, empty lists and junk", async () => {
    for (const body of [{ redirect_uris: ["https://evil.example.com/cb"] }, { redirect_uris: [] }, { redirect_uris: [REDIRECT, "http://evil.com"] }, {}, "x", null]) {
      const result = await registerClient(body, store);
      expect(isFailure(result)).toBe(true);
    }
    expect(store.clients.size).toBe(0);
  });
});

describe("authorization request", () => {
  const good = (clientId: string) => ({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256" });

  it("accepts a valid request and grants only the read scope whatever is asked for", async () => {
    const id = await registered();
    const check = await checkAuthorizeRequest({ ...good(id), scope: "mcp:read mcp:write admin" }, store, ORIGIN);
    expect(check.ok && check.request.scope).toBe("mcp:read");
    expect(check.ok && check.request.resource).toBe(`${ORIGIN}/mcp`);
  });

  it("shows an error page, never a redirect, for an unknown client or unregistered redirect", async () => {
    const id = await registered();
    expect(await checkAuthorizeRequest({ ...good("nope") }, store, ORIGIN)).toMatchObject({ ok: false, fatal: expect.any(String) });
    expect(await checkAuthorizeRequest({ ...good(id), redirect_uri: "https://claude.ai/other" }, store, ORIGIN)).toMatchObject({ ok: false, fatal: expect.any(String) });
  });

  it("requires PKCE S256 and the code flow, sending those errors back to the client", async () => {
    const id = await registered();
    const noPkce = await checkAuthorizeRequest({ ...good(id), code_challenge: undefined, state: "s1" }, store, ORIGIN);
    expect(noPkce.ok === false && "redirectTo" in noPkce && noPkce.redirectTo).toContain("error=invalid_request");
    const plain = await checkAuthorizeRequest({ ...good(id), code_challenge_method: "plain" }, store, ORIGIN);
    expect(plain.ok).toBe(false);
    const token = await checkAuthorizeRequest({ ...good(id), response_type: "token" }, store, ORIGIN);
    expect(token.ok === false && "redirectTo" in token && token.redirectTo).toContain("unsupported_response_type");
  });

  it("rejects a resource that is not this server", async () => {
    const id = await registered();
    const check = await checkAuthorizeRequest({ ...good(id), resource: "https://other.example.com/mcp" }, store, ORIGIN);
    expect(check.ok === false && "redirectTo" in check && check.redirectTo).toContain("invalid_target");
    expect((await checkAuthorizeRequest({ ...good(id), resource: `${ORIGIN}/mcp/` }, store, ORIGIN)).ok).toBe(true);
  });

  it("builds a denial redirect carrying the state", async () => {
    const id = await registered();
    const check = await checkAuthorizeRequest({ ...good(id), state: "abc" }, store, ORIGIN);
    if (!check.ok) throw new Error("unexpected");
    const url = new URL(denyAuthorization(check.request));
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("abc");
  });
});

describe("token exchange", () => {
  it("exchanges a code for tokens, stored only as hashes", async () => {
    const id = await registered();
    const { code } = await approved(id);
    const result = await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN);
    if (isFailure(result)) throw new Error(result.error_description);
    expect(result.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp:read" });
    const grant = [...store.grants.values()][0];
    expect(grant.accessTokenHash).toBe(sha256Hex(result.body.access_token));
    expect(JSON.stringify([...store.grants.values()])).not.toContain(result.body.access_token);
    expect(JSON.stringify([...store.codes.values()])).not.toContain(code);
  });

  it("works exactly once per code", async () => {
    const id = await registered();
    const { code } = await approved(id);
    expect(isFailure(await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN))).toBe(false);
    const again = await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN);
    expect(again).toMatchObject({ error: "invalid_grant" });
  });

  it("fails on a wrong verifier, wrong redirect, expired code, other client's code, or no verifier", async () => {
    const id = await registered();
    const other = await registered();
    const bad = async (extra: Record<string, string>, at = NOW, clientId = id) => {
      const { code } = await approved(id);
      return exchangeToken(tokenRequest(clientId, code, extra), null, store, at, ORIGIN);
    };
    expect(await bad({ code_verifier: "x".repeat(50) })).toMatchObject({ error: "invalid_grant" });
    expect(await bad({ redirect_uri: "https://claude.ai/different" })).toMatchObject({ error: "invalid_grant" });
    expect(await bad({}, new Date(NOW.getTime() + 6 * 60_000))).toMatchObject({ error: "invalid_grant" });
    expect(await bad({}, NOW, other)).toMatchObject({ error: "invalid_grant" });
    const { code } = await approved(id);
    expect(await exchangeToken(form({ grant_type: "authorization_code", client_id: id, code, redirect_uri: REDIRECT }), null, store, NOW, ORIGIN)).toMatchObject({ error: "invalid_request" });
    expect(store.grants.size).toBe(0);
  });

  it("requires the secret from a confidential client", async () => {
    const reg = await registerClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" }, store);
    if (isFailure(reg)) throw new Error("unexpected");
    const id = reg.body.client_id as string;
    const secret = reg.body.client_secret as string;
    const { code } = await approved(id);
    expect(await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN)).toMatchObject({ error: "invalid_client", status: 401 });
    const { code: code2 } = await approved(id);
    expect(isFailure(await exchangeToken(tokenRequest(id, code2, { client_secret: secret }), null, store, NOW, ORIGIN))).toBe(false);
  });
});

describe("refresh tokens", () => {
  async function connected() {
    const id = await registered();
    const { code } = await approved(id);
    const first = await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN);
    if (isFailure(first)) throw new Error("unexpected");
    return { id, ...first.body };
  }
  const refresh = (id: string, token: string, at = NOW) => exchangeToken(form({ grant_type: "refresh_token", client_id: id, refresh_token: token }), null, store, at, ORIGIN);

  it("rotates: the new pair works, the old access token stops", async () => {
    const t = await connected();
    const next = await refresh(t.id, t.refresh_token);
    if (isFailure(next)) throw new Error("unexpected");
    expect(next.body.refresh_token).not.toBe(t.refresh_token);
    expect(await authenticateBearer(next.body.access_token, store, NOW, ORIGIN)).not.toBeNull();
    expect(await authenticateBearer(t.access_token, store, NOW, ORIGIN)).toBeNull();
  });

  it("revokes the whole grant if an already-used refresh token is replayed", async () => {
    const t = await connected();
    const next = await refresh(t.id, t.refresh_token);
    if (isFailure(next)) throw new Error("unexpected");
    expect(await refresh(t.id, t.refresh_token)).toMatchObject({ error: "invalid_grant" });
    expect(await authenticateBearer(next.body.access_token, store, NOW, ORIGIN)).toBeNull();
    expect(await refresh(t.id, next.body.refresh_token)).toMatchObject({ error: "invalid_grant" });
  });

  it("refuses after 30 days, after revocation, and once the user is no longer an admin", async () => {
    const t = await connected();
    expect(await refresh(t.id, t.refresh_token, new Date(NOW.getTime() + 31 * 86_400_000))).toMatchObject({ error: "invalid_grant" });
    store.users.get("u-justin")!.isAdmin = false;
    expect(await refresh(t.id, t.refresh_token)).toMatchObject({ error: "invalid_grant" });
    store.users.get("u-justin")!.isAdmin = true;
    await revokeToken(t.refresh_token, store, NOW);
    expect(await refresh(t.id, t.refresh_token)).toMatchObject({ error: "invalid_grant" });
  });

  it("will not widen the scope", async () => {
    const t = await connected();
    const result = await exchangeToken(form({ grant_type: "refresh_token", client_id: t.id, refresh_token: t.refresh_token, scope: "mcp:read mcp:write" }), null, store, NOW, ORIGIN);
    expect(result).toMatchObject({ error: "invalid_scope" });
  });
});

describe("revocation and bearer checks", () => {
  it("revoking the access token kills both tokens", async () => {
    const id = await registered();
    const { code } = await approved(id);
    const result = await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN);
    if (isFailure(result)) throw new Error("unexpected");
    expect(await authenticateBearer(result.body.access_token, store, NOW, ORIGIN)).toMatchObject({ userId: "u-justin", scope: "mcp:read" });
    await revokeToken(result.body.access_token, store, NOW);
    expect(await authenticateBearer(result.body.access_token, store, NOW, ORIGIN)).toBeNull();
    expect(await exchangeToken(form({ grant_type: "refresh_token", client_id: id, refresh_token: result.body.refresh_token }), null, store, NOW, ORIGIN)).toMatchObject({ error: "invalid_grant" });
  });

  it("revoking an unknown token is not an error", async () => {
    await expect(revokeToken("never-issued", store, NOW)).resolves.toBeUndefined();
  });

  it("tokens expire after an hour", async () => {
    const id = await registered();
    const { code } = await approved(id);
    const result = await exchangeToken(tokenRequest(id, code), null, store, NOW, ORIGIN);
    if (isFailure(result)) throw new Error("unexpected");
    expect(await authenticateBearer(result.body.access_token, store, new Date(NOW.getTime() + 59 * 60_000), ORIGIN)).not.toBeNull();
    expect(await authenticateBearer(result.body.access_token, store, new Date(NOW.getTime() + 61 * 60_000), ORIGIN)).toBeNull();
  });
});
