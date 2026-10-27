// The /mcp endpoint, with its collaborators passed in so it can be tested end
// to end without a database. Stateless Streamable HTTP: one POST in, one JSON
// response out. GET (the optional server-push stream) and DELETE are refused.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AuditSink } from "./audit";
import { authenticateBearer, type McpAuth } from "./oauth/flow";
import { CORS_HEADERS, isAllowedMcpOrigin, mcpUrl } from "./oauth/config";
import type { OAuthStore } from "./oauth/store";
import { createMcpServer, type Runner } from "./server";

export interface McpHttpDeps {
  store: OAuthStore;
  audit: AuditSink;
  run: Runner;
  origin: string;
  now?: () => Date;
}

const MAX_BODY_BYTES = 256 * 1024;

export const protectedResourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/mcp`;

function jsonRpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS, ...headers },
  });
}

function unauthorized(origin: string, description: string, withError: boolean): Response {
  const challenge = [`Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}"`, 'scope="mcp:read"'];
  if (withError) challenge.push('error="invalid_token"', `error_description="${description}"`);
  return jsonRpcError(401, -32001, description, { "WWW-Authenticate": challenge.join(", ") });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

interface RpcMessage {
  id?: string | number | null;
  method?: string;
  params?: { name?: unknown; arguments?: unknown };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function handleMcpHttp(request: Request, deps: McpHttpDeps): Promise<Response> {
  const { origin } = deps;
  const now = deps.now ?? (() => new Date());

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && !isAllowedMcpOrigin(requestOrigin, origin)) return jsonRpcError(403, -32000, "Origin not allowed.");

  const token = bearerToken(request);
  if (!token) return unauthorized(origin, "Authorization required.", false);
  const auth: McpAuth | null = await authenticateBearer(token, deps.store, now(), origin);
  if (!auth) return unauthorized(origin, "The access token is invalid, expired, or revoked.", true);

  if (request.method !== "POST") {
    return jsonRpcError(405, -32000, "Method not allowed. Send JSON-RPC requests with POST.", { Allow: "POST, OPTIONS" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return jsonRpcError(413, -32600, "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonRpcError(400, -32700, "Parse error.");
  }
  const messages: RpcMessage[] = (Array.isArray(body) ? body : [body]).filter(isObject);

  // Log every tool call before it runs. If the log can't be written, nothing runs.
  const started = Date.now();
  const logged: { rpcId: string | number | null | undefined; auditId: string }[] = [];
  try {
    for (const message of messages) {
      if (message.method !== "tools/call") continue;
      const tool = typeof message.params?.name === "string" ? message.params.name : "(missing tool name)";
      const auditId = await deps.audit.begin({ auth, tool, args: message.params?.arguments });
      logged.push({ rpcId: message.id, auditId });
    }
  } catch (error) {
    console.error("mcp audit log write failed:", error);
    return jsonRpcError(500, -32603, "Could not record this request, so it was not run.");
  }

  const server = createMcpServer(deps.run, now);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  let response: Response;
  try {
    response = await transport.handleRequest(request, {
      parsedBody: body,
      authInfo: { token: "", clientId: auth.clientId, scopes: auth.scope.split(" ") },
    });
  } finally {
    // Stateless: the server and transport only live for this one request.
    void server.close().catch(() => undefined);
  }

  const responseText = await response.text();
  if (logged.length) await finishAudit(deps.audit, logged, responseText, Date.now() - started);

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Cache-Control", "no-store");
  return new Response(response.status === 204 || response.status === 202 ? null : responseText, { status: response.status, headers });
}

async function finishAudit(audit: AuditSink, logged: { rpcId: string | number | null | undefined; auditId: string }[], responseText: string, durationMs: number) {
  let replies: unknown[] = [];
  try {
    const parsed = JSON.parse(responseText);
    replies = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // No JSON body: every call is recorded as failed below.
  }
  for (const { rpcId, auditId } of logged) {
    const reply = replies.find((r): r is Record<string, unknown> => isObject(r) && r.id === rpcId);
    let ok = false;
    let error: string | null = "No response was produced.";
    if (reply) {
      const result = isObject(reply.result) ? reply.result : null;
      if (isObject(reply.error)) {
        error = String(reply.error.message ?? "Error");
      } else if (result?.isError === true) {
        const first = Array.isArray(result.content) ? result.content[0] : null;
        error = isObject(first) && typeof first.text === "string" ? first.text : "Tool error";
      } else {
        ok = true;
        error = null;
      }
    }
    try {
      await audit.finish(auditId, { ok, error, durationMs });
    } catch (e) {
      console.error("mcp audit finish failed:", e);
    }
  }
}

export { mcpUrl };
