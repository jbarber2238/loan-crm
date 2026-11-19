import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { lenderDocuments, products } from "@/server/db/schema";
import { extractLenderProgramsFromDocuments, type ExtractedCriteria } from "@/server/ai/extract-lender-criteria";
import { extractAndStoreCriteria } from "@/server/actions/lender-documents";
import { findOrCreateProduct } from "@/server/actions/lenders";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";

// More than this many distinct documents and a single read gets unwieldy (page-image budget), so only the newest few go in.
const MAX_DOCUMENTS = 4;

type Doc = typeof lenderDocuments.$inferSelect;

/**
 * A lender's product documents, one copy of each distinct file (older bulk uploads stored the same file once per
 * product), newest first, capped. These are the documents read together to build the lender's programs.
 */
export async function loadLenderDocuments(lenderId: string): Promise<Doc[]> {
  const rows = await db.query.lenderDocuments.findMany({
    where: eq(lenderDocuments.lenderId, lenderId),
    orderBy: (d, { desc }) => desc(d.createdAt),
  });
  const seen = new Set<string>();
  const out: Doc[] = [];
  for (const d of rows) {
    if (d.productId === null) continue; // lender-wide overlays are handled by their own extraction
    const key = `${d.fileName}|${d.fileSize}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.slice(0, MAX_DOCUMENTS);
}

export interface ReextractLenderReport {
  documents: string[];
  updated: { productId: string; name: string; category: string; created: boolean; tiers: number }[];
  untouched: { productId: string; name: string; category: string }[];
  notes: string | null;
}

/**
 * Re-reads ALL of a lender's documents together and files each program found under its own product (creating a
 * separately-named product for a separate program, like "Equity First"). A product whose program isn't found in the
 * documents keeps its existing data. Nothing is written when the read finds no programs at all.
 */
export async function reextractLenderPrograms(
  lenderId: string,
  opts: { dryRun?: boolean } = {}
): Promise<{ report: ReextractLenderReport; programs: ExtractedCriteria[] }> {
  const docs = await loadLenderDocuments(lenderId);
  if (!docs.length) throw new Error("This lender has no uploaded documents to read.");

  const existing = await db.query.products.findMany({ where: eq(products.lenderId, lenderId) });
  const known = existing.map((p) => ({
    category: p.category,
    // The standard product carries the category's own label; anything else is a separately-named program.
    programName: p.name.trim().toLowerCase() === labelFor(LOAN_CATEGORIES, p.category).toLowerCase() ? null : p.name,
  }));
  const { programs, general } = await extractLenderProgramsFromDocuments(docs, known);
  const report: ReextractLenderReport = {
    documents: docs.map((d) => d.fileName),
    updated: [],
    untouched: [],
    notes: general.extractionNotes,
  };
  if (!programs.length) return { report, programs };

  const touched = new Set<string>();
  if (!opts.dryRun) {
    for (const program of programs) {
      const category = program.detectedCategory as (typeof LOAN_CATEGORIES)[number]["value"];
      const before = await db.query.products.findMany({
        where: and(eq(products.lenderId, lenderId), eq(products.category, category)),
      });
      const product = await findOrCreateProduct(lenderId, category, program.programName);
      const created = !before.some((p) => p.id === product.id);
      await extractAndStoreCriteria(product.id, docs[0], program);
      touched.add(product.id);
      const row = await db.query.products.findFirst({ where: eq(products.id, product.id) });
      report.updated.push({
        productId: product.id,
        name: row?.name ?? labelFor(LOAN_CATEGORIES, category),
        category,
        created,
        tiers: program.tiers.length,
      });
    }
  }

  const all = await db.query.products.findMany({ where: eq(products.lenderId, lenderId) });
  for (const p of all) {
    if (!touched.has(p.id)) report.untouched.push({ productId: p.id, name: p.name, category: p.category });
  }
  return { report, programs };
}
