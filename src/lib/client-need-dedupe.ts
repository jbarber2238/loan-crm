// Deciding whether a catalog need is already on a deal, for the automatic flows that must not add a second copy.
//
// Needs are named for what they are, not whose they are, so two lenders can each have their own "Loan Application".
// The name alone is no longer enough: when both copies carry a lender tag and the tags differ, they are different forms
// (a deal that moved from one lender to another needs the new lender's). A copy with no tag still counts as the same
// need, which keeps older untagged copies from being doubled up.

export interface DedupeNeed {
  itemName: string;
  lenderTagId?: string | null;
}

export function isSameNeed(existing: DedupeNeed, incoming: DedupeNeed): boolean {
  if (existing.itemName.trim().toLowerCase() !== incoming.itemName.trim().toLowerCase()) return false;
  if (existing.lenderTagId && incoming.lenderTagId && existing.lenderTagId !== incoming.lenderTagId) return false;
  return true;
}

/** The incoming needs that are not already on the deal. */
export function needsNotAlreadyOnDeal<T extends DedupeNeed>(existing: DedupeNeed[], incoming: T[]): T[] {
  return incoming.filter((n) => !existing.some((e) => isSameNeed(e, n)));
}
