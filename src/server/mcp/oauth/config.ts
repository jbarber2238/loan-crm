export const MCP_SCOPE = "mcp:read";
export const CODE_TTL_MS = 5 * 60_000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
export const MAX_REGISTERED_CLIENTS = 500;

/**
 * The public origin the connector is served from. APP_URL is what the rest of
 * the CRM uses for links; the request's own origin is only the fallback (local dev).
 */
export function appOrigin(request?: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}

/** Same as appOrigin, for server components that have headers() but no Request. */
export function originFromHeaders(headers: Headers): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const mcpUrl = (origin: string): string => `${origin}/mcp`;

const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function extraRedirectHosts(): string[] {
  return (process.env.MCP_OAUTH_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Where an authorization code may be sent. Anyone can register a client, so
 * without this an attacker could register their own redirect and talk an admin
 * into approving it. Allowed: claude.ai / claude.com over https, loopback (the
 * MCP Inspector and desktop clients), and any hosts listed in
 * MCP_OAUTH_REDIRECT_HOSTS. No fragments.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const hostWithBrackets = host.includes(":") ? `[${host.replace(/^\[|\]$/g, "")}]` : host;
  if (LOOPBACK_HOSTS.has(hostWithBrackets)) return url.protocol === "http:" || url.protocol === "https:";
  if (url.protocol !== "https:") return false;
  return [...DEFAULT_REDIRECT_HOSTS, ...extraRedirectHosts()].includes(host);
}

/** Browser Origins allowed to call /mcp directly (requests with no Origin are server-to-server and fine). */
export function isAllowedMcpOrigin(origin: string, appOriginValue: string): boolean {
  if (origin === appOriginValue) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host.includes(":") ? `[${host.replace(/^\[|\]$/g, "")}]` : host)) return true;
  return url.protocol === "https:" && [...DEFAULT_REDIRECT_HOSTS, ...extraRedirectHosts()].includes(host);
}

/** Claude's clients call from servers, but the MCP Inspector and discovery fetches can come from a browser. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS, ...init.headers },
  });
}
