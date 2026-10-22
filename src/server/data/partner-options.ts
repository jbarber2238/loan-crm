import { inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates } from "@/server/db/schema";

/** Partners a deal can be credited to, labelled for a picker. */
export async function loadAssignablePartners() {
  const rows = await db.query.referralAffiliates.findMany({
    where: inArray(referralAffiliates.status, ["active", "paused", "legacy"]),
    orderBy: (a, { asc }) => asc(a.name),
    columns: { id: true, name: true, email: true },
  });
  return rows.map((a) => ({ id: a.id, label: a.name ? `${a.name} (${a.email})` : a.email }));
}
