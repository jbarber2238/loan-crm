import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { mcpAuditLog } from "@/server/db/schema";
import type { McpAuth } from "./oauth/flow";

export interface AuditSink {
  /** Writes the row BEFORE the tool runs, so a call can never go unlogged. Returns the row id. */
  begin(entry: { auth: McpAuth; tool: string; args: unknown }): Promise<string>;
  finish(id: string, outcome: { ok: boolean; error: string | null; durationMs: number }): Promise<void>;
}

const MAX_LOGGED_ARGS_CHARS = 4000;

/** Arguments are small filters and ids, but cap them so a hostile client can't bloat the log. */
export function loggableArgs(args: unknown): unknown {
  if (args === undefined) return null;
  const text = JSON.stringify(args) ?? "null";
  return text.length <= MAX_LOGGED_ARGS_CHARS ? args : { truncated: true, preview: text.slice(0, MAX_LOGGED_ARGS_CHARS) };
}

export const dbAuditSink: AuditSink = {
  async begin({ auth, tool, args }) {
    const [row] = await db
      .insert(mcpAuditLog)
      .values({ userId: auth.userId, grantId: auth.grantId, clientId: auth.clientId, tool: tool.slice(0, 200), arguments: loggableArgs(args) })
      .returning({ id: mcpAuditLog.id });
    return row.id;
  },
  async finish(id, outcome) {
    await db
      .update(mcpAuditLog)
      .set({ ok: outcome.ok, error: outcome.error?.slice(0, 500) ?? null, durationMs: outcome.durationMs })
      .where(eq(mcpAuditLog.id, id));
  },
};
