import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, users } from "@/server/db/schema";
import type { RecipientCandidate } from "@/lib/email-recipients";

/**
 * The people a processor might want to add onto a deal email's To/Cc line
 * beyond whatever default recipient a given email type already has: the
 * deal's own team, the lender rep, and any manually-added followers. A
 * follower is flagged so the UI can warn before adding them — everyone else
 * here is a known person inside the org (or a lender rep), not "outside."
 *
 * `includeAllStaff` pulls in every active user in the system, not just this
 * deal's assigned team — borrower-facing emails should be able to loop in
 * any staff member, not only whoever's assigned to this specific deal.
 */
export async function getEmailRecipientCandidates(
  dealId: string,
  { includeAllStaff = false }: { includeAllStaff?: boolean } = {}
): Promise<RecipientCandidate[]> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: {
      assignedLoanOfficer: true,
      assignedProcessor: true,
      assignedAssistant: true,
      lender: { with: { reps: true } },
      followers: true,
    },
  });
  if (!deal) return [];

  const candidates: RecipientCandidate[] = [];
  const seen = new Set<string>();
  function add(name: string | null | undefined, email: string | null | undefined, roleLabel?: string, isFollower?: boolean) {
    if (!email || !email.trim()) return;
    const key = email.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      label: roleLabel ? `${name ?? email} (${roleLabel})` : (name ?? email),
      email: email.trim(),
      isFollower,
    });
  }

  add(deal.assignedLoanOfficer?.name, deal.assignedLoanOfficer?.email, "Loan Officer");
  add(deal.assignedProcessor?.name, deal.assignedProcessor?.email, "Processor");
  add(deal.assignedAssistant?.name, deal.assignedAssistant?.email, "Loan Officer Assistant");
  for (const rep of deal.lender?.reps ?? []) {
    add(rep.name, rep.email, `${deal.lender!.name} Rep`);
  }
  for (const f of deal.followers) {
    add(f.name, f.email, f.roleLabel ?? "Follower", true);
  }

  if (includeAllStaff) {
    const allUsers = await db.query.users.findMany({ where: eq(users.active, true) });
    for (const u of allUsers) add(u.name, u.email);
  }

  return candidates;
}
