import { CORS_HEADERS, appOrigin, json } from "@/server/mcp/oauth/config";
import { exchangeToken, isFailure } from "@/server/mcp/oauth/flow";
import { dbOAuthStore } from "@/server/mcp/oauth/store";

export const dynamic = "force-dynamic";

function basicCredentials(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Basic\s+(\S+)$/i.exec(header);
  if (!match) return null;
  const [id, ...rest] = Buffer.from(match[1], "base64").toString("utf8").split(":");
  return id ? { id: decodeURIComponent(id), secret: decodeURIComponent(rest.join(":")) } : null;
}

export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  const result = await exchangeToken(form, basicCredentials(request), dbOAuthStore, new Date(), appOrigin(request));
  if (isFailure(result)) return json({ error: result.error, error_description: result.error_description }, { status: result.status });
  return json(result.body);
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
