// Exports the Max Allowable Offer calculator's current numbers as a working
// Excel file — not a snapshot of the results, but the same formulas the
// calculator itself runs, so someone can keep changing ARV, rehab, rates,
// etc. after they've left the site and see everything recalculate. Cell
// addresses below are hand-tracked (SheetJS has no "next row" helper that
// also knows formula references), so any row inserted/removed here has to
// be re-checked against every formula that references it.
//
// SheetJS's free build (the version installed here, from sheetjs.com's own
// CDN rather than the outdated npm registry package) writes formulas and
// number formats correctly, but does not persist cell fill/font styling —
// confirmed by writing a styled cell and reading it back. So instead of
// color-coding input vs. computed cells, every input row's label ends in
// "— enter yours" and every computed row's label ends in "(auto)".

export interface MaxOfferExcelInputs {
  arv: number;
  rehabBudget: number;
  offerPct: number; // 0-100
  purchasePrice: number;
  ltcPct: number; // 0-100
  ltarvPct: number; // 0-100
  carryRatePct: number; // e.g. 10.5
  timelineMonths: number;
  annualTaxes: number;
  annualInsurance: number;
  monthlyMisc: number;
  acqPct: number; // 0-100
  originationPts: number; // 0-100
  dispoPct: number; // 0-100
}

const CURRENCY = "$#,##0";
const PERCENT = "0.0%";

type Cell = string | number | { f: string; z?: string } | { v: number; t: "n"; z?: string };

function n(v: number, z?: string): Cell {
  return { v, t: "n", z };
}

function pct(v0to100: number, z = PERCENT): Cell {
  return { v: v0to100 / 100, t: "n", z };
}

function f(formula: string, z?: string): Cell {
  return { f: formula, z };
}

export async function downloadMaxOfferExcel(inputs: MaxOfferExcelInputs): Promise<void> {
  const XLSX = await import("xlsx");

  const rows: Cell[][] = [
    ["Manna Lending — Max Allowable Offer Calculator", ""],
    ["Change any “enter yours” cell — everything marked (auto) recalculates. Keep stress-testing below.", ""],
    ["", ""],
    // Section 1 — rows 4-8
    ["1. MAX ALLOWABLE OFFER", ""],
    ["After-Repair Value (ARV) — enter yours", n(inputs.arv, CURRENCY)],
    ["Rehab Budget — enter yours", n(inputs.rehabBudget, CURRENCY)],
    ["Percent of ARV — enter yours", pct(inputs.offerPct)],
    ["Max Allowable Offer (auto)", f("B5*B7-B6", CURRENCY)],
    ["", ""],
    // Section 2 — rows 10-17
    ["2. PURCHASE PRICE & LEVERAGE", ""],
    ["Purchase Price — enter yours (defaults to Max Offer)", n(inputs.purchasePrice, CURRENCY)],
    ["Loan-to-Cost (LTC) % — enter yours", pct(inputs.ltcPct)],
    ["Loan-to-ARV (LTARV) % — enter yours", pct(inputs.ltarvPct)],
    ["Cost Basis (auto)", f("B11+B6", CURRENCY)],
    ["Max Loan by LTC (auto)", f("B14*B12", CURRENCY)],
    ["Max Loan by LTARV (auto)", f("B5*B13", CURRENCY)],
    ["Loan Amount (auto)", f("MIN(B15,B16)", CURRENCY)],
    ["", ""],
    // Section 3 — rows 19-22
    ["3. CARRYING COSTS (DEBT)", ""],
    ["Annual Interest Rate % — enter yours", pct(inputs.carryRatePct)],
    ["Project Timeline (months) — enter yours", n(inputs.timelineMonths)],
    ["Total Interest (auto)", f("B17*B20*(B21/12)", CURRENCY)],
    ["", ""],
    // Section 4 — rows 24-28
    ["4. HOLDING COSTS (PROPERTY)", ""],
    ["Annual Property Taxes — enter yours", n(inputs.annualTaxes, CURRENCY)],
    ["Annual Insurance — enter yours", n(inputs.annualInsurance, CURRENCY)],
    ["Monthly Misc. Holding Costs (utilities, HOA, lawn, snow) — enter yours", n(inputs.monthlyMisc, CURRENCY)],
    ["Total Holding Costs (auto)", f("(B25/12+B26/12+B27)*B21", CURRENCY)],
    ["", ""],
    // Section 5 — rows 30-36
    ["5. CLOSING COSTS", ""],
    ["Acquisition Closing % — enter yours", pct(inputs.acqPct)],
    ["Lender Origination Points — enter yours", pct(inputs.originationPts)],
    ["Disposition Closing % — enter yours", pct(inputs.dispoPct)],
    ["Acquisition Cost $ (auto)", f("B11*B31", CURRENCY)],
    ["Lender Points $ (auto)", f("B17*B32", CURRENCY)],
    ["Disposition Cost $ (auto)", f("B5*B33", CURRENCY)],
    ["", ""],
    // Section 6 — rows 38-42
    ["6. PROFIT & MARGIN", ""],
    ["Total Project Cost (auto)", f("B11+B6+B34+B35+B22+B28", CURRENCY)],
    ["Sale Proceeds (auto)", f("B5-B36", CURRENCY)],
    ["Profit (auto)", f("B40-B39", CURRENCY)],
    ["Profit Margin % of ARV (auto)", f("B41/B5", PERCENT)],
    ["", ""],
    // Stress test — rows 44-50 (uses columns A-D)
    ["STRESS TEST — WHAT IF THE SALE PRICE COMES IN LOWER?", "", "", ""],
    ["ARV Change — enter your own scenarios", "Stressed ARV (auto)", "Stressed Profit (auto)", "Stressed Margin % (auto)"],
    [pct(0), f("B5*(1-A46)", CURRENCY), f("B46-(B46*$B$33)-$B$39", CURRENCY), f("C46/B46", PERCENT)],
    [pct(5), f("B5*(1-A47)", CURRENCY), f("B47-(B47*$B$33)-$B$39", CURRENCY), f("C47/B47", PERCENT)],
    [pct(10), f("B5*(1-A48)", CURRENCY), f("B48-(B48*$B$33)-$B$39", CURRENCY), f("C48/B48", PERCENT)],
    [pct(15), f("B5*(1-A49)", CURRENCY), f("B49-(B49*$B$33)-$B$39", CURRENCY), f("C49/B49", PERCENT)],
    ["", ""],
    [
      "This spreadsheet is for planning purposes only and is not a quote, pre-qualification, or commitment to lend.",
      "",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 52 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } },
    { s: { r: 18, c: 0 }, e: { r: 18, c: 3 } },
    { s: { r: 23, c: 0 }, e: { r: 23, c: 3 } },
    { s: { r: 29, c: 0 }, e: { r: 29, c: 3 } },
    { s: { r: 37, c: 0 }, e: { r: 37, c: 3 } },
    { s: { r: 43, c: 0 }, e: { r: 43, c: 3 } },
    { s: { r: 50, c: 0 }, e: { r: 50, c: 3 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Max Offer Calculator");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manna-lending-max-offer-calculator-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
