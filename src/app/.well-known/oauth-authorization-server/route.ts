import { appOrigin, json, CORS_HEADERS, MCP_SCOPE } from "@/server/mcp/oauth/config";

export const dynamic = "force-dynamic";

// RFC 8414 metadata: tells the client where to register, authorize and get tokens.
export function GET(request: Request) {
  const origin = appOrigin(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [MCP_SCOPE],
  });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
