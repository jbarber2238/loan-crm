import { describe, expect, it } from "vitest";

// Talks to the real database, so it only runs when asked:
//   MCP_DB_TESTS=1 node --env-file=.env.local ./node_modules/.bin/vitest run src/server/mcp/__tests__/mcp-db-live.test.ts
// It writes nothing: the one write it tries is refused by Postgres itself.
describe.skipIf(!process.env.MCP_DB_TESTS)("live database", () => {
  it("refuses an INSERT inside the connector's read-only transaction", async () => {
    const { withReadOnlyData } = await import("../data");
    const { db } = await import("@/server/db/client");
    const { sql } = await import("drizzle-orm");
    // withReadOnlyData hands tools a data object only; prove the transaction mode with the same options it uses.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`insert into mcp_audit_log (tool) values ('readonly-probe')`);
      }, { accessMode: "read only" })
    ).rejects.toThrow();
    const rows = await db.execute(sql`select count(*)::int as n from mcp_audit_log where tool = 'readonly-probe'`);
    expect((rows as unknown as { n: number }[])[0].n).toBe(0);
    await expect(withReadOnlyData(async (data) => (await data.listDeals({ stages: ["new"] })).length)).resolves.toBeTypeOf("number");
  });

  it("runs every read query against the real schema", async () => {
    const { withReadOnlyData } = await import("../data");
    const { getLoan, listOpenLoans, listOutstandingNeeds, listRecentActivity, pipelineSummary } = await import("../operations");
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    await withReadOnlyData(async (data) => {
      const loans = await listOpenLoans(data, { limit: 3 });
      if (loans.items[0]) await getLoan(data, { loan_id: String(loans.items[0].loan_number) }, now);
      await listOutstandingNeeds(data, { limit: 3 }, now);
      await listRecentActivity(data, { since, limit: 5 }, now);
      await pipelineSummary(data, now);
    });
  });
});
