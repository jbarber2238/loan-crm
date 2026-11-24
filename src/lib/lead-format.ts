export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function leadDealSummary(inputsRaw: unknown, resultsRaw: unknown): string | null {
  const inputs = inputsRaw as { arv?: number; purchasePrice?: number; calculator?: string; loanAmount?: number; buydownFee?: number; rateNoBuydown?: number; rateWithBuydown?: number } | null;
  const results = resultsRaw as { profitMarginPct?: number } | null;
  // The rate buy-down calculator saves a different set of numbers.
  if (inputs?.calculator === "rate_buydown" && inputs.loanAmount) {
    const parts = [`Loan ${formatMoney(inputs.loanAmount)}`];
    if (inputs.buydownFee) parts.push(`Buy-down ${formatMoney(inputs.buydownFee)}`);
    if (inputs.rateNoBuydown && inputs.rateWithBuydown) parts.push(`${inputs.rateNoBuydown}% to ${inputs.rateWithBuydown}%`);
    return parts.join(" · ");
  }
  if (!inputs?.arv) return null;
  const parts = [`ARV ${formatMoney(inputs.arv)}`];
  if (inputs.purchasePrice) parts.push(`Purchase ${formatMoney(inputs.purchasePrice)}`);
  if (results?.profitMarginPct !== undefined) parts.push(`Margin ${results.profitMarginPct.toFixed(1)}%`);
  return parts.join(" · ");
}
