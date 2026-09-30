export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function leadDealSummary(inputsRaw: unknown, resultsRaw: unknown): string | null {
  const inputs = inputsRaw as { arv?: number; purchasePrice?: number } | null;
  const results = resultsRaw as { profitMarginPct?: number } | null;
  if (!inputs?.arv) return null;
  const parts = [`ARV ${formatMoney(inputs.arv)}`];
  if (inputs.purchasePrice) parts.push(`Purchase ${formatMoney(inputs.purchasePrice)}`);
  if (results?.profitMarginPct !== undefined) parts.push(`Margin ${results.profitMarginPct.toFixed(1)}%`);
  return parts.join(" · ");
}
