import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { TOOL_NAMES, createMcpServer } from "../server";
import { NOW, fakeData } from "./fixtures";

async function connect() {
  const data = fakeData();
  const server = createMcpServer((fn) => fn(data), () => NOW);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, data };
}

const READ_METHODS = ["listTeam", "listDeals", "findDeal", "stageCounts", "lastActivity", "stageHistory", "conditions", "keyDateEvents", "needs", "needDocuments", "recentActivity"];
const parse = (result: unknown) => JSON.parse(((result as { content: { text: string }[] }).content[0]).text);

describe("tool list", () => {
  it("exposes exactly the five read-only tools, each annotated read-only", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
  });

  it("offers no resources or prompts that could carry data or actions", async () => {
    const { client } = await connect();
    expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: true } });
  });
});

describe("tools over the protocol", () => {
  it("runs each tool and returns JSON text", async () => {
    const { client } = await connect();
    const loans = parse(await client.callTool({ name: "list_open_loans", arguments: {} }));
    expect(loans.total).toBe(3);
    const loan = parse(await client.callTool({ name: "get_loan", arguments: { loan_id: "1001" } }));
    expect(loan.borrower_name).toBe("Acme Holdings");
    const needs = parse(await client.callTool({ name: "list_outstanding_needs", arguments: { older_than_hours: 48 } }));
    expect(needs.total).toBe(3);
    const activity = parse(await client.callTool({ name: "list_recent_activity", arguments: { since: "2026-10-26T00:00:00Z" } }));
    expect(activity.items.length).toBeGreaterThan(0);
    const summary = parse(await client.callTool({ name: "pipeline_summary", arguments: {} }));
    expect(summary.open_loans).toBe(3);
  });

  it("accepts a loan number sent as a JSON number", async () => {
    const { client } = await connect();
    expect(parse(await client.callTool({ name: "get_loan", arguments: { loan_id: 1001 } })).loan_number).toBe(1001);
    expect(parse(await client.callTool({ name: "list_outstanding_needs", arguments: { loan_id: 1001 } })).total).toBe(2);
    expect(parse(await client.callTool({ name: "list_recent_activity", arguments: { since: "2026-10-20T00:00:00Z", loan_id: 1002 } })).items.length).toBeGreaterThan(0);
  });

  it("turns bad input into a readable tool error, not a crash", async () => {
    const { client } = await connect();
    const unknownLoan = await client.callTool({ name: "get_loan", arguments: { loan_id: "9999" } });
    expect(unknownLoan.isError).toBe(true);
    expect(JSON.stringify(unknownLoan.content)).toMatch(/No loan found/);
    const tooBig = await client.callTool({ name: "list_open_loans", arguments: { limit: 5000 } });
    expect(tooBig.isError).toBe(true);
  });

  it("does not leak internals when the database fails", async () => {
    const server = createMcpServer(async () => {
      throw new Error("connection refused to db.internal.example:5432 password=hunter2");
    }, () => NOW);
    const client = new Client({ name: "test", version: "1.0.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), client.connect(c)]);
    const result = await client.callTool({ name: "pipeline_summary", arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/hunter2|db\.internal/);
  });
});

describe("write attempts are rejected", () => {
  const WRITE_TOOLS = [
    ["update_loan", { loan_id: "1001", stage: "closed" }],
    ["move_stage", { loan_id: "1001", stage: "closed" }],
    ["create_note", { loan_id: "1001", body: "hello" }],
    ["add_client_need", { loan_id: "1001", item: "Anything" }],
    ["accept_client_need", { need_id: "n1" }],
    ["delete_loan", { loan_id: "1001" }],
    ["send_email", { to: "a@b.com", subject: "x", body: "y" }],
    ["send_reminder", { need_id: "n1" }],
    ["trigger_automation", { name: "client-needs-reminders" }],
    ["run_sql", { query: "update deals set stage = 'closed'" }],
  ] as const;

  it.each(WRITE_TOOLS)("%s does not exist and nothing runs", async (name, args) => {
    const { client, data } = await connect();
    let rejected = false;
    try {
      const result = await client.callTool({ name, arguments: { ...args } });
      rejected = result.isError === true;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(data.calls).toEqual([]);
  });

  it("ignores extra write-looking arguments on a real tool", async () => {
    const { client, data } = await connect();
    await client.callTool({ name: "get_loan", arguments: { loan_id: "1001", stage: "closed", delete: true, note: "x" } });
    expect(data.calls.length).toBeGreaterThan(0);
    expect(data.calls.every((c) => READ_METHODS.includes(c))).toBe(true);
  });

  it("the data interface has no method that could write", () => {
    const data = fakeData();
    const methods = Object.keys(data).filter((k) => k !== "calls");
    expect(methods.sort()).toEqual([...READ_METHODS].sort());
  });

  it("every tool only ever calls read methods", async () => {
    const { client, data } = await connect();
    await client.callTool({ name: "list_open_loans", arguments: {} });
    await client.callTool({ name: "get_loan", arguments: { loan_id: "1001" } });
    await client.callTool({ name: "list_outstanding_needs", arguments: {} });
    await client.callTool({ name: "list_recent_activity", arguments: { since: "2026-10-26T00:00:00Z" } });
    await client.callTool({ name: "pipeline_summary", arguments: {} });
    expect(new Set(data.calls).size).toBeGreaterThan(5);
    expect(data.calls.every((c) => READ_METHODS.includes(c))).toBe(true);
  });
});
