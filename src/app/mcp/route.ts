import { dbAuditSink } from "@/server/mcp/audit";
import { withReadOnlyData } from "@/server/mcp/data";
import { handleMcpHttp } from "@/server/mcp/http";
import { appOrigin } from "@/server/mcp/oauth/config";
import { dbOAuthStore } from "@/server/mcp/oauth/store";

// Read-only MCP server for claude.ai's custom connector. See src/server/mcp/README.md.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handle = (request: Request) =>
  handleMcpHttp(request, { store: dbOAuthStore, audit: dbAuditSink, run: withReadOnlyData, origin: appOrigin(request) });

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
