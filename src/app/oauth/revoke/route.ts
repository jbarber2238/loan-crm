import { CORS_HEADERS } from "@/server/mcp/oauth/config";
import { revokeToken } from "@/server/mcp/oauth/flow";
import { dbOAuthStore } from "@/server/mcp/oauth/store";

export const dynamic = "force-dynamic";

// RFC 7009. Whoever holds a token can revoke it; an unknown token is not an error.
export async function POST(request: Request) {
  const token = new URLSearchParams(await request.text()).get("token");
  if (token) await revokeToken(token, dbOAuthStore, new Date());
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
