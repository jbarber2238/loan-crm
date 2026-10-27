import { appOrigin, json, CORS_HEADERS, mcpUrl, MCP_SCOPE } from "@/server/mcp/oauth/config";

export const dynamic = "force-dynamic";

// RFC 9728 metadata, at the root and (below) at the path-suffixed URL some clients ask for.
export function GET(request: Request) {
  const origin = appOrigin(request);
  return json({
    resource: mcpUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Manna CRM (read-only)",
  });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
