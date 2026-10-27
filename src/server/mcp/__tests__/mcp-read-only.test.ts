import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The connector reads the database only through withReadOnlyData, which must
// always ask Postgres for a READ ONLY transaction, and data.ts must never name a
// column or call that could write or expose a secret.

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _config?: unknown) => fn({ execute: vi.fn(async () => undefined) }));
vi.mock("@/server/db/client", () => ({ db: { transaction } }));

const dir = path.resolve(__dirname, "..");
const dataSource = readFileSync(path.join(dir, "data.ts"), "utf8");
const code = (s: string) => s.replace(/\/\/.*$/gm, "");

describe("withReadOnlyData", () => {
  it("always opens a read-only transaction", async () => {
    const { withReadOnlyData } = await import("../data");
    await withReadOnlyData(async () => "ok");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual({ accessMode: "read only" });
  });
});

describe("data.ts source guard", () => {
  const body = code(dataSource);

  it("contains no write statements", () => {
    for (const forbidden of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.onConflict/, /sql`\s*(insert|update|delete|truncate|drop|alter|create)\b/i, /\.execute\(sql`(?!set local statement_timeout)/]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it("never names a column that holds document contents, answers or identity numbers", () => {
    for (const forbidden of [
      /\bdata:\s*dealClientNeedDocuments\.data/,
      /dealClientNeedDocuments\.data\b/,
      /\bdealFiles\b/,
      /\blenderDocuments\b/,
      /dealAppraisalDocuments/,
      /templateFileData/,
      /customFormData/,
      /dealClientNeedAnswers\.answerText/,
      /answerText/,
      /bodyHtml/,
      /ssn|socialSecurity|dateOfBirth|\bdob\b|accountNumber|routingNumber|taxId|bankAccount/i,
      /borrowerEmail|borrowerPhone/,
    ]) {
      expect(body, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("uses no raw `select *`", () => {
    expect(body).not.toMatch(/\.select\(\)\s*\.from\(\s*(deals|dealClientNeeds|dealClientNeedDocuments|emailLogEntries|dealNotes)\b/);
  });
});

describe("the connector has no write path anywhere", () => {
  it("only the OAuth store and audit sink write, and only to the connector's own tables", () => {
    const writers = new Set<string>();
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(entry.name) && /\b(?:db|tx|h)\s*\.(?:insert|update|delete)\(/.test(code(readFileSync(p, "utf8")))) {
          writers.add(path.relative(dir, p));
        }
      }
    };
    walk(dir);
    expect([...writers].sort()).toEqual(["audit.ts", path.join("oauth", "store.ts")]);
    for (const file of ["audit.ts", path.join("oauth", "store.ts")]) {
      const source = code(readFileSync(path.join(dir, file), "utf8"));
      const tables = [...source.matchAll(/\.(?:insert|update|delete)\(\s*(\w+)\s*\)/g)].map((m) => m[1]);
      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) expect(table).toMatch(/^mcp(Audit|Oauth)/);
    }
  });
});
