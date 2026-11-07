// Lender responsiveness: how long a lender takes to come back with pricing.
//
// Every pricing request is its own "round". A round runs from when the request
// was SENT to the first term sheet drafted from that lender after it, and stops
// there, before the lender's next request begins. Re-pricing a loan sends a new
// request, so it gets its own round instead of being timed back to the first one.

export interface TurnRequest {
  lenderId: string;
  sentAt: Date | null;
  isQuickPricer: boolean;
}

export interface TurnTermSheet {
  lenderId: string;
  createdAt: Date;
}

export interface TurnSample {
  lenderId: string;
  /** Days from the request being sent to the term sheet being drafted. */
  days: number;
  /** When the term sheet was drafted: the moment the round finished. */
  completedAt: Date;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** One deal's completed pricing rounds. */
export function lenderTurnSamples(requests: TurnRequest[], termSheets: TurnTermSheet[]): TurnSample[] {
  // Quick pricers answer instantly, and a request that was never sent hasn't
  // started a round: neither says anything about how fast a lender replies.
  const rounds = requests
    .filter((r): r is TurnRequest & { sentAt: Date } => !r.isQuickPricer && r.sentAt !== null)
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  const samples: TurnSample[] = [];
  rounds.forEach((round, i) => {
    const nextStart = rounds.slice(i + 1).find((r) => r.lenderId === round.lenderId)?.sentAt ?? null;
    const answer = termSheets
      .filter(
        (t) =>
          t.lenderId === round.lenderId &&
          t.createdAt.getTime() >= round.sentAt.getTime() &&
          (nextStart === null || t.createdAt.getTime() < nextStart.getTime())
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!answer) return;
    samples.push({
      lenderId: round.lenderId,
      days: (answer.createdAt.getTime() - round.sentAt.getTime()) / DAY_MS,
      completedAt: answer.createdAt,
    });
  });
  return samples;
}
