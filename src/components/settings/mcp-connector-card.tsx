import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { mcpAuditLog, mcpOauthClients, mcpOauthTokens, users } from "@/server/db/schema";
import { revokeAllMcpConnections, revokeMcpConnection } from "@/server/actions/mcp-connector";
import { appOrigin, mcpUrl } from "@/server/mcp/oauth/config";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";

/** Settings > Integrations: the read-only Claude connector's URL, who has connected it, and what it has been asked. */
export async function McpConnectorCard() {
  const now = new Date();
  const [grants, calls] = await Promise.all([
    db
      .select({
        id: mcpOauthTokens.id,
        clientName: mcpOauthClients.clientName,
        userName: users.name,
        userEmail: users.email,
        createdAt: mcpOauthTokens.createdAt,
        lastUsedAt: mcpOauthTokens.lastUsedAt,
      })
      .from(mcpOauthTokens)
      .innerJoin(mcpOauthClients, eq(mcpOauthClients.clientId, mcpOauthTokens.clientId))
      .innerJoin(users, eq(users.id, mcpOauthTokens.userId))
      .where(and(isNull(mcpOauthTokens.revokedAt), gt(mcpOauthTokens.refreshExpiresAt, now)))
      .orderBy(desc(mcpOauthTokens.createdAt)),
    db
      .select({ id: mcpAuditLog.id, tool: mcpAuditLog.tool, args: mcpAuditLog.arguments, ok: mcpAuditLog.ok, error: mcpAuditLog.error, at: mcpAuditLog.createdAt, userName: users.name })
      .from(mcpAuditLog)
      .leftJoin(users, eq(users.id, mcpAuditLog.userId))
      .orderBy(desc(mcpAuditLog.createdAt))
      .limit(15),
  ]);
  const url = mcpUrl(appOrigin());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Claude connector (read-only)</CardTitle>
        <Badge variant={grants.length ? "success" : "secondary"}>{grants.length ? `${grants.length} connected` : "Not connected"}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lets Claude look at the loan pipeline: loans, stages, client needs and recent activity. It can&apos;t change anything or send anything, and never sees SSNs, bank or account
          numbers, birth dates or document contents. To connect it, open Claude → Settings → Connectors → Add custom connector and paste:
        </p>
        <code className="block rounded bg-muted px-2 py-1.5 text-sm break-all">{url}</code>

        {grants.length > 0 && (
          <div className="space-y-2">
            {grants.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-md border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{g.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    Approved by {g.userName ?? g.userEmail} · connected {when(g.createdAt)} · last used {when(g.lastUsedAt)}
                  </p>
                </div>
                <ActionForm action={revokeMcpConnection} successMessage="Disconnected" confirmMessage={`Disconnect ${g.clientName}? It will lose access immediately.`}>
                  <input type="hidden" name="grantId" value={g.id} />
                  <SubmitButton variant="destructive" size="sm">
                    Disconnect
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
            {grants.length > 1 && (
              <ActionForm action={revokeAllMcpConnections} successMessage="All connections removed" confirmMessage="Disconnect every connected app?">
                <SubmitButton variant="outline" size="sm">
                  Disconnect all
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        )}

        {calls.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Recent requests</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{when(c.at)}</td>
                      <td className="px-3 py-1.5">{c.userName ?? "Unknown"}</td>
                      <td className="px-3 py-1.5 font-mono">{c.tool}</td>
                      <td className="max-w-[16rem] truncate px-3 py-1.5 font-mono text-muted-foreground">{c.args ? JSON.stringify(c.args) : ""}</td>
                      <td className="px-3 py-1.5">{c.ok === false ? <span className="text-destructive">{c.error ?? "failed"}</span> : c.ok ? "ok" : "…"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
