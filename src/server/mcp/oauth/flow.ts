// The connector's OAuth 2.1 authorization server, as pure functions over an
// OAuthStore: dynamic client registration (RFC 7591), the authorization request
// checks, PKCE-protected code exchange, rotating refresh tokens, and bearer
// token authentication for /mcp. Every token is scoped "mcp:read", the only scope there is.

import { randomUUID } from "node:crypto";
import { safeText } from "../redact";
import { ACCESS_TOKEN_TTL_MS, CODE_TTL_MS, MAX_REGISTERED_CLIENTS, MCP_SCOPE, REFRESH_TOKEN_TTL_MS, isAllowedRedirectUri, mcpUrl } from "./config";
import { pkceMatches, randomToken, safeEqual, sha256Hex } from "./crypto";
import type { ClientRecord, OAuthStore } from "./store";

export interface OAuthFailure {
  error: string;
  error_description: string;
  status: number;
}
const fail = (error: string, error_description: string, status = 400): OAuthFailure => ({ error, error_description, status });
export const isFailure = (v: unknown): v is OAuthFailure => typeof v === "object" && v !== null && "error" in v && "status" in v;

const sameResource = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Dynamic client registration
// ---------------------------------------------------------------------------

export async function registerClient(body: unknown, store: OAuthStore) {
  if (typeof body !== "object" || body === null) return fail("invalid_client_metadata", "Send a JSON object.");
  const meta = body as Record<string, unknown>;
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string")) {
    return fail("invalid_redirect_uri", "redirect_uris must be a list of 1 to 10 URLs.");
  }
  const bad = (uris as string[]).find((u) => !isAllowedRedirectUri(u));
  if (bad) {
    return fail("invalid_redirect_uri", `Redirect URL not allowed: ${safeText(bad, 120)}. Only claude.ai, claude.com and localhost redirects are accepted.`);
  }
  if (Array.isArray(meta.grant_types) && !meta.grant_types.includes("authorization_code")) {
    return fail("invalid_client_metadata", "grant_types must include authorization_code.");
  }
  if ((await store.countClients()) >= MAX_REGISTERED_CLIENTS) return fail("temporarily_unavailable", "Too many registered clients.", 503);

  const wantsSecret = meta.token_endpoint_auth_method === "client_secret_post" || meta.token_endpoint_auth_method === "client_secret_basic";
  const secret = wantsSecret ? randomToken(32) : null;
  const client: ClientRecord = {
    clientId: randomUUID(),
    clientName: safeText(typeof meta.client_name === "string" ? meta.client_name : null, 80) ?? "MCP client",
    redirectUris: uris as string[],
    tokenEndpointAuthMethod: wantsSecret ? "client_secret_post" : "none",
    clientSecretHash: secret ? sha256Hex(secret) : null,
  };
  await store.saveClient(client);
  return {
    status: 201,
    body: {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: MCP_SCOPE,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Authorization request
// ---------------------------------------------------------------------------

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
  scope: string;
}

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest; client: ClientRecord }
  // The client or redirect can't be trusted: show an error page, never redirect.
  | { ok: false; fatal: string }
  // The redirect is trusted, so the error goes back to the client.
  | { ok: false; redirectTo: string };

function errorRedirect(redirectUri: string, state: string | null, error: string, description: string): AuthorizeCheck {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return { ok: false, redirectTo: url.toString() };
}

export async function checkAuthorizeRequest(params: Record<string, string | undefined>, store: OAuthStore, origin: string): Promise<AuthorizeCheck> {
  const client = params.client_id ? await store.getClient(params.client_id) : null;
  if (!client) return { ok: false, fatal: "This connection request is missing a valid client. Start again from Claude." };
  const redirectUri = params.redirect_uri;
  if (!redirectUri || !client.redirectUris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
    return { ok: false, fatal: "This connection request used a redirect address that was not registered. Start again from Claude." };
  }
  const state = params.state ?? null;
  if (params.response_type !== "code") return errorRedirect(redirectUri, state, "unsupported_response_type", "Only response_type=code is supported.");
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return errorRedirect(redirectUri, state, "invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(params.code_challenge)) {
    return errorRedirect(redirectUri, state, "invalid_request", "code_challenge is not a valid S256 challenge.");
  }
  const resource = params.resource ?? mcpUrl(origin);
  if (!sameResource(resource, mcpUrl(origin))) return errorRedirect(redirectUri, state, "invalid_target", "resource must be this server's /mcp URL.");
  // Whatever scopes are asked for, the only thing ever granted is read-only access.
  return { ok: true, client, request: { clientId: client.clientId, redirectUri, codeChallenge: params.code_challenge, state, resource: mcpUrl(origin), scope: MCP_SCOPE } };
}

/** The admin approved: mint a one-time code and return the URL to send the browser to. */
export async function approveAuthorization(req: AuthorizeRequest, userId: string, store: OAuthStore, now: Date): Promise<string> {
  const code = randomToken(32);
  await store.saveCode({
    codeHash: sha256Hex(code),
    clientId: req.clientId,
    userId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    resource: req.resource,
    scope: req.scope,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  const url = new URL(req.redirectUri);
  url.searchParams.set("code", code);
  if (req.state) url.searchParams.set("state", req.state);
  return url.toString();
}

export function denyAuthorization(req: AuthorizeRequest): string {
  const url = new URL(req.redirectUri);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("error_description", "The request was declined.");
  if (req.state) url.searchParams.set("state", req.state);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

async function authenticateClient(form: URLSearchParams, basic: { id: string; secret: string } | null, store: OAuthStore): Promise<ClientRecord | OAuthFailure> {
  const clientId = form.get("client_id") ?? basic?.id;
  if (!clientId) return fail("invalid_client", "client_id is required.", 401);
  const client = await store.getClient(clientId);
  if (!client) return fail("invalid_client", "Unknown client.", 401);
  if (client.tokenEndpointAuthMethod === "client_secret_post") {
    const secret = form.get("client_secret") ?? basic?.secret ?? "";
    if (!client.clientSecretHash || !secret || !safeEqual(sha256Hex(secret), client.clientSecretHash)) {
      return fail("invalid_client", "Client authentication failed.", 401);
    }
  }
  return client;
}

function tokenBody(access: string, refresh: string) {
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_MS / 1000, refresh_token: refresh, scope: MCP_SCOPE };
}

export async function exchangeToken(
  form: URLSearchParams,
  basic: { id: string; secret: string } | null,
  store: OAuthStore,
  now: Date,
  origin: string
): Promise<{ status: 200; body: ReturnType<typeof tokenBody> } | OAuthFailure> {
  const client = await authenticateClient(form, basic, store);
  if (isFailure(client)) return client;
  const grantType = form.get("grant_type");

  const requestedResource = form.get("resource");
  if (requestedResource && !sameResource(requestedResource, mcpUrl(origin))) return fail("invalid_target", "resource must be this server's /mcp URL.");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || !verifier) return fail("invalid_request", "code and code_verifier are required.");
    const record = await store.takeCode(sha256Hex(code), now);
    if (!record || record.clientId !== client.clientId) return fail("invalid_grant", "The authorization code is invalid, expired, or already used.");
    if (form.get("redirect_uri") !== record.redirectUri) return fail("invalid_grant", "redirect_uri does not match the authorization request.");
    if (!pkceMatches(verifier, record.codeChallenge)) return fail("invalid_grant", "PKCE verification failed.");
    const access = randomToken(32);
    const refresh = randomToken(32);
    await store.createGrant({
      userId: record.userId,
      clientId: client.clientId,
      accessTokenHash: sha256Hex(access),
      refreshTokenHash: sha256Hex(refresh),
      resource: record.resource,
      scope: MCP_SCOPE,
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    });
    return { status: 200, body: tokenBody(access, refresh) };
  }

  if (grantType === "refresh_token") {
    const presented = form.get("refresh_token");
    if (!presented) return fail("invalid_request", "refresh_token is required.");
    const hash = sha256Hex(presented);
    const grant = await store.findGrantByRefreshHash(hash);
    if (!grant || grant.clientId !== client.clientId || grant.revokedAt) return fail("invalid_grant", "The refresh token is invalid or revoked.");
    if (grant.refreshTokenHash !== hash) {
      // An older refresh token came back: a copy of it exists somewhere else. Cut the whole grant off.
      await store.revokeGrant(grant.id, now);
      return fail("invalid_grant", "This refresh token was already used. Reconnect to continue.");
    }
    if (grant.refreshExpiresAt <= now) return fail("invalid_grant", "The refresh token has expired. Reconnect to continue.");
    if (!grant.user.active || !grant.user.isAdmin) return fail("invalid_grant", "The user who authorized this connection no longer has admin access.");
    const requestedScope = form.get("scope");
    if (requestedScope && requestedScope.split(/\s+/).some((s) => s !== MCP_SCOPE)) return fail("invalid_scope", `Only ${MCP_SCOPE} is available.`);
    const access = randomToken(32);
    const refresh = randomToken(32);
    await store.rotateGrant(grant.id, {
      accessTokenHash: sha256Hex(access),
      refreshTokenHash: sha256Hex(refresh),
      previousRefreshTokenHash: hash,
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    });
    return { status: 200, body: tokenBody(access, refresh) };
  }

  return fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** RFC 7009: revoking a token we don't know is not an error. */
export async function revokeToken(token: string, store: OAuthStore, now: Date): Promise<void> {
  const hash = sha256Hex(token);
  const grant = (await store.findGrantByAccessHash(hash)) ?? (await store.findGrantByRefreshHash(hash));
  if (grant) await store.revokeGrant(grant.id, now);
}

// ---------------------------------------------------------------------------
// Bearer authentication for /mcp
// ---------------------------------------------------------------------------

export interface McpAuth {
  grantId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  clientId: string;
  scope: string;
}

const TOUCH_INTERVAL_MS = 60_000;

export async function authenticateBearer(token: string, store: OAuthStore, now: Date, origin: string): Promise<McpAuth | null> {
  const grant = await store.findGrantByAccessHash(sha256Hex(token));
  if (!grant || grant.revokedAt || grant.accessExpiresAt <= now) return null;
  if (!grant.user.active || !grant.user.isAdmin) return null;
  if (!grant.scope.split(" ").includes(MCP_SCOPE)) return null;
  if (!sameResource(grant.resource, mcpUrl(origin))) return null;
  if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) await store.touchGrant(grant.id, now);
  return { grantId: grant.id, userId: grant.userId, userName: grant.user.name, userEmail: grant.user.email, clientId: grant.clientId, scope: grant.scope };
}
