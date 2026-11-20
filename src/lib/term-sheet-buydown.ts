export interface MergeableOption {
  label: string;
  fields: Record<string, string | number>;
  buydownOptions: { points: number; interestRate: number; loanAmount: number | null; monthlyPayment: number | null; dscr: number | null }[];
}

/**
 * Safety net for a rate-buydown grid the AI split into separate options (one per point level). Options that match on
 * everything except the rate and the points paid (the buydown fee) are one loan at different buydown levels, and the
 * higher the points the lower the rate. Those collapse into a single option with a `buydownOptions` list.
 */
export function mergeSplitBuydownOptions<T extends MergeableOption>(options: T[]): T[] {
  const PRICING_KEYS = new Set(["interestRate", "costToBorrowerFee", "rateBuydownPoints"]);
  const groups = new Map<string, number[]>();
  options.forEach((o, i) => {
    if (o.buydownOptions.length > 0 || !Number.isFinite(Number(o.fields.interestRate))) return;
    const rest = Object.entries(o.fields)
      .filter(([k]) => !PRICING_KEYS.has(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify(rest);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });

  const drop = new Set<number>();
  const merged = new Map<number, T>();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const rows = idxs.map((i) => {
      const f = options[i].fields;
      const loan = Number(f.loanAmount);
      const fee = Number(f.costToBorrowerFee);
      const points = Number.isFinite(fee) && fee > 0 && loan > 0 ? Math.round((fee / loan) * 10000) / 100 : 0;
      return { i, points, interestRate: Number(f.interestRate) };
    });
    rows.sort((a, b) => a.points - b.points);
    const ordered = rows.every((r, k) => k === 0 || (r.points > rows[k - 1].points && r.interestRate < rows[k - 1].interestRate));
    if (!ordered) continue;
    const first = options[rows[0].i];
    const label = first.label.replace(/\s*@\s*[\d.]+%.*$/, "").trim() || first.label;
    merged.set(Math.min(...idxs), {
      ...first,
      label,
      buydownOptions: rows.map((r) => ({
        points: r.points,
        interestRate: r.interestRate,
        loanAmount: null,
        monthlyPayment: null,
        dscr: null,
      })),
    });
    idxs.forEach((i) => drop.add(i));
  }
  if (merged.size === 0) return options;
  return options.flatMap((o, i) => (merged.has(i) ? [merged.get(i)!] : drop.has(i) ? [] : [o]));
}
