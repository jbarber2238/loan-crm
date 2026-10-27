// Builds the MCP server and registers the five tools. Every tool is read-only:
// the tool list is closed (there is no write tool to call), each one carries the
// readOnlyHint annotation, and the data behind them is a read-only transaction.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLoan, listOpenLoans, listOutstandingNeeds, listRecentActivity, pipelineSummary } from "./operations";
import { McpInputError } from "./pagination";
import type { McpData } from "./model";

export type Runner = <T>(fn: (data: McpData) => Promise<T>) => Promise<T>;

export const TOOL_NAMES = ["list_open_loans", "get_loan", "list_outstanding_needs", "list_recent_activity", "pipeline_summary"] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const limit = z.number().int().min(1).max(100).optional().describe("Page size, 1-100 (default 25).");
const cursor = z.string().max(200).optional().describe("The next_cursor from the previous page, to get the next page.");
// Loan numbers are numbers, and some clients send them as JSON numbers, so accept both.
const loanId = z.union([z.string().min(1).max(64), z.number().int().positive()]).describe("The loan's id (uuid) or its loan number, e.g. 1042 or #1042.");
const assignedTo = z.string().min(1).max(120);

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export function createMcpServer(run: Runner, now: () => Date = () => new Date()): McpServer {
  const server = new McpServer({ name: "manna-crm", version: "1.0.0" }, {
    instructions:
      "Read-only view of the Manna loan pipeline. Use pipeline_summary first for the big picture, then list_open_loans, get_loan, list_outstanding_needs and list_recent_activity to drill in. Nothing here can change the CRM or send anything. Documents are shown by name and review status only.",
  });

  // One wrapper so every tool turns bad input into a readable error and never leaks internals.
  const tool =
    <A,>(name: string, fn: (data: McpData, args: A) => Promise<unknown>) =>
    async (args: A) => {
      try {
        return textResult(await run((data) => fn(data, args)));
      } catch (error) {
        if (error instanceof McpInputError) return errorResult(error.message);
        console.error(`mcp tool ${name} failed:`, error);
        return errorResult("The CRM could not be read just now. Try again in a moment.");
      }
    };

  server.registerTool(
    "list_open_loans",
    {
      title: "List open loans",
      description:
        "Open loans (New through Clear to Close; closed, lost, archived and deleted loans are left out), soonest target close first. Each has loan id and number, borrower, property address, loan type (DSCR, Fix and flip, Ground up, Bridge), lender, stage, target close date, loan officer, processor and last activity time. Pass stage to see a different stage, such as on_hold or follow_up.",
      inputSchema: {
        stage: z.string().max(40).optional().describe("Only loans in this stage, e.g. underwriting_review, clear_to_close, on_hold."),
        assigned_to: assignedTo.optional().describe("Only loans where this person is the loan officer, processor or assistant. A name (or part of one), email or user id."),
        limit,
        cursor,
      },
      annotations: READ_ONLY,
    },
    tool("list_open_loans", (data, args: { stage?: string; assigned_to?: string; limit?: number; cursor?: string }) => listOpenLoans(data, args))
  );

  server.registerTool(
    "get_loan",
    {
      title: "Get one loan",
      description:
        "Everything about one loan: the list fields plus loan amount, stage history with timestamps, conditions, every client need (with the names and review status of uploaded documents, never their contents), the assigned team, referral partner and key dates (credit pull, rate lock, target close, clear to close, appraisal/insurance/title).",
      inputSchema: { loan_id: loanId },
      annotations: READ_ONLY,
    },
    tool("get_loan", (data, args: { loan_id: string | number }) => getLoan(data, { loan_id: String(args.loan_id) }, now()))
  );

  server.registerTool(
    "list_outstanding_needs",
    {
      title: "List outstanding client needs",
      description:
        "Open client needs (items still to be requested, received or reviewed; accepted, unused and on-hold needs are left out), oldest first. Each shows the loan, the item, who requested it, who owes it right now (borrower, processor, title, insurance or lender), when it was requested, the last reminder sent, the borrower's last upload or activity, whether it blocks underwriting or closing, and its age in hours. Fields ending in _inferred are best guesses where the CRM has no recorded value.",
      inputSchema: {
        loan_id: loanId.optional().describe("Only this loan's needs (any stage). Omit to search all open loans."),
        older_than_hours: z.number().min(0).max(100000).optional().describe("Only needs requested at least this many hours ago."),
        assigned_to: assignedTo.optional().describe("Only loans where this person is the loan officer, processor or assistant."),
        limit,
        cursor,
      },
      annotations: READ_ONLY,
    },
    tool("list_outstanding_needs", (data, args: { loan_id?: string | number; older_than_hours?: number; assigned_to?: string; limit?: number; cursor?: string }) =>
      listOutstandingNeeds(data, { ...args, loan_id: args.loan_id === undefined ? undefined : String(args.loan_id) }, now())
    )
  );

  server.registerTool(
    "list_recent_activity",
    {
      title: "List recent activity",
      description:
        "What happened since a point in time, newest first: stage changes, client needs added or accepted, document uploads (file name only), borrower form submissions, notes and emails logged in the CRM. Looks back at most 90 days.",
      inputSchema: {
        since: z.string().min(8).max(40).describe("ISO timestamp, e.g. 2026-10-26T00:00:00Z."),
        loan_id: loanId.optional().describe("Only this loan's activity."),
        limit,
        cursor,
      },
      annotations: READ_ONLY,
    },
    tool("list_recent_activity", (data, args: { since: string; loan_id?: string | number; limit?: number; cursor?: string }) =>
      listRecentActivity(data, { ...args, loan_id: args.loan_id === undefined ? undefined : String(args.loan_id) }, now())
    )
  );

  server.registerTool(
    "pipeline_summary",
    {
      title: "Pipeline summary",
      description:
        "The big picture: loan counts by stage, open loans with no activity in 3+ days, client needs older than 48 hours grouped by who owes them, and open loans with a target close in the next 10 days.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    tool("pipeline_summary", (data) => pipelineSummary(data, now()))
  );

  return server;
}
