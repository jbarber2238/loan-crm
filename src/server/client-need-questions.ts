import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { clientNeedQuestions, dealClientNeedAnswers } from "@/server/db/schema";

/**
 * For every newly-created questionnaire dealClientNeed, copies its catalog
 * item's question list onto dealClientNeedAnswers (answerText null until the
 * borrower fills it in) — the same plain-snapshot pattern as itemName/
 * description/needType on dealClientNeeds itself.
 */
export async function copyQuestionsToNewNeeds(
  entries: { dealNeedId: string; catalogClientNeedId: string; needType: string }[]
) {
  const questionnaireEntries = entries.filter((e) => e.needType === "questionnaire");
  if (!questionnaireEntries.length) return;

  const catalogIds = [...new Set(questionnaireEntries.map((e) => e.catalogClientNeedId))];
  const questions = await db.query.clientNeedQuestions.findMany({
    where: inArray(clientNeedQuestions.clientNeedId, catalogIds),
    orderBy: (q, { asc }) => asc(q.sortOrder),
  });
  if (!questions.length) return;

  const byCatalogId = new Map<string, typeof questions>();
  for (const q of questions) {
    const list = byCatalogId.get(q.clientNeedId) ?? [];
    list.push(q);
    byCatalogId.set(q.clientNeedId, list);
  }

  const rows = questionnaireEntries.flatMap((e) =>
    (byCatalogId.get(e.catalogClientNeedId) ?? []).map((q) => ({
      clientNeedId: e.dealNeedId,
      questionText: q.questionText,
      sortOrder: q.sortOrder,
    }))
  );
  if (!rows.length) return;

  await db.insert(dealClientNeedAnswers).values(rows);
}
