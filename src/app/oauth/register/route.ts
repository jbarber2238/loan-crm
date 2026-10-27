import { CORS_HEADERS, json } from "@/server/mcp/oauth/config";
import { isFailure, registerClient } from "@/server/mcp/oauth/flow";
import { dbOAuthStore } from "@/server/mcp/oauth/store";

export const dynamic = "force-dynamic";

// RFC 7591 dynamic client registration. Anyone may register, but a client can only
// ever receive a code at a claude.ai / claude.com / localhost redirect, and only
// after an admin approves it on the consent screen.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Send a JSON body." }, { status: 400 });
  }
  const result = await registerClient(body, dbOAuthStore);
  if (isFailure(result)) return json({ error: result.error, error_description: result.error_description }, { status: result.status });
  return json(result.body, { status: result.status });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
