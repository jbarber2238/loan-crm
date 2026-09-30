// Exports the Max Allowable Offer calculator's current numbers as a working,
// on-brand Excel file — not a snapshot of the results, but the same
// formulas the calculator itself runs, so someone can clear the gold
// (editable) cells, drop in a different deal's numbers, and watch every
// other cell recalculate. Cell addresses below are hand-tracked (there's no
// "next row" helper that also knows formula references), so any row
// inserted/removed here has to be re-checked against every formula that
// references it — see the exhaustive address list this was verified
// against when it shipped.
//
// Uses exceljs rather than the xlsx (SheetJS) package already in this repo
// — SheetJS's free build writes formulas fine but silently drops cell
// fills/fonts and can't embed images, both confirmed by a real write+read
// round trip. exceljs supports styling, sheet protection, and image
// embedding natively, which is what real branding requires here.

const TEAL = "FF143D4A";
const GOLD_LIGHT = "FFF3E4C0";
const WHITE = "FFFFFFFF";
const SAND_LIGHT = "FFEDE6DA";

const CURRENCY = "$#,##0";
const PERCENT = "0.0%";

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function downloadMaxOfferExcel(inputs: MaxOfferExcelInputs): Promise<void> {
  // The "reversed" (white) lockup, not the primary teal one — this sits on
  // the teal title band, where the teal-on-transparent version would be
  // invisible.
  const [ExcelJS, logoResponse] = await Promise.all([
    import("exceljs"),
    fetch("/brand/manna-lending-onecolor-white-transparent.png").catch(() => null),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Manna Lending";
  const ws = wb.addWorksheet("Max Offer Calculator", {
    views: [{ showGridLines: false }],
  });

  ws.columns = [{ width: 52 }, { width: 18 }, { width: 18 }, { width: 18 }];

  function label(addr: string, text: string) {
    ws.getCell(addr).value = text;
  }

  function header(row: number, text: string) {
    ws.mergeCells(`A${row}:D${row}`);
    const cell = ws.getCell(`A${row}`);
    cell.value = text;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 12 };
    cell.alignment = { vertical: "middle" };
    ws.getRow(row).height = 22;
  }

  function inputCell(addr: string, value: number, numFmt: string) {
    const cell = ws.getCell(addr);
    cell.value = value;
    cell.numFmt = numFmt;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_LIGHT } };
    cell.protection = { locked: false };
    cell.border = { top: { style: "thin", color: { argb: "FFD8C48C" } }, bottom: { style: "thin", color: { argb: "FFD8C48C" } }, left: { style: "thin", color: { argb: "FFD8C48C" } }, right: { style: "thin", color: { argb: "FFD8C48C" } } };
  }

  function formulaCell(addr: string, formula: string, numFmt: string, emphasize = false) {
    const cell = ws.getCell(addr);
    cell.value = { formula };
    cell.numFmt = numFmt;
    if (emphasize) cell.font = { bold: true, color: { argb: TEAL }, size: 12 };
  }

  // --- Title ---
  ws.getRow(1).height = 66;
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  titleCell.value = "Max Allowable Offer Calculator";
  titleCell.font = { bold: true, color: { argb: WHITE }, size: 16 };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.mergeCells("A2:D2");
  const subtitleCell = ws.getCell("A2");
  subtitleCell.value =
    "Clear the gold cells and enter a new deal's numbers — every other cell recalculates automatically. Keep stress-testing below.";
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF68735F" } };
  subtitleCell.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(2).height = 28;

  if (logoResponse?.ok) {
    const logoBuffer = await logoResponse.arrayBuffer();
    const imageId = wb.addImage({ base64: arrayBufferToBase64(logoBuffer), extension: "png" });
    // Real aspect ratio of the source asset is 840x320 (2.625:1) — sized to
    // fit inside the 66pt title row without distortion, anchored to the
    // right side of the teal band so it never overlaps the title text.
    ws.addImage(imageId, { tl: { col: 2.75, row: 0.18 }, ext: { width: 108, height: 41 } });
  }

  // Section 1 — rows 4-8
  header(4, "1. MAX ALLOWABLE OFFER");
  label("A5", "After-Repair Value (ARV) — enter yours");
  inputCell("B5", inputs.arv, CURRENCY);
  label("A6", "Rehab Budget — enter yours");
  inputCell("B6", inputs.rehabBudget, CURRENCY);
  label("A7", "Percent of ARV — enter yours");
  inputCell("B7", inputs.offerPct / 100, PERCENT);
  label("A8", "Max Allowable Offer (auto)");
  formulaCell("B8", "B5*B7-B6", CURRENCY, true);

  // Section 2 — rows 10-17
  header(10, "2. PURCHASE PRICE & LEVERAGE");
  label("A11", "Purchase Price — enter yours (defaults to Max Offer)");
  inputCell("B11", inputs.purchasePrice, CURRENCY);
  label("A12", "Loan-to-Cost (LTC) % — enter yours");
  inputCell("B12", inputs.ltcPct / 100, PERCENT);
  label("A13", "Loan-to-ARV (LTARV) % — enter yours");
  inputCell("B13", inputs.ltarvPct / 100, PERCENT);
  label("A14", "Cost Basis (auto)");
  formulaCell("B14", "B11+B6", CURRENCY);
  label("A15", "Max Loan by LTC (auto)");
  formulaCell("B15", "B14*B12", CURRENCY);
  label("A16", "Max Loan by LTARV (auto)");
  formulaCell("B16", "B5*B13", CURRENCY);
  label("A17", "Loan Amount (auto)");
  formulaCell("B17", "MIN(B15,B16)", CURRENCY, true);

  // Section 3 — rows 19-22
  header(19, "3. CARRYING COSTS (DEBT)");
  label("A20", "Annual Interest Rate % — enter yours");
  inputCell("B20", inputs.carryRatePct / 100, PERCENT);
  label("A21", "Project Timeline (months) — enter yours");
  inputCell("B21", inputs.timelineMonths, "0");
  label("A22", "Total Interest (auto)");
  formulaCell("B22", "B17*B20*(B21/12)", CURRENCY, true);

  // Section 4 — rows 24-28
  header(24, "4. HOLDING COSTS (PROPERTY)");
  label("A25", "Annual Property Taxes — enter yours");
  inputCell("B25", inputs.annualTaxes, CURRENCY);
  label("A26", "Annual Insurance — enter yours");
  inputCell("B26", inputs.annualInsurance, CURRENCY);
  label("A27", "Monthly Misc. Holding Costs (utilities, HOA, lawn, snow) — enter yours");
  inputCell("B27", inputs.monthlyMisc, CURRENCY);
  label("A28", "Total Holding Costs (auto)");
  formulaCell("B28", "(B25/12+B26/12+B27)*B21", CURRENCY, true);

  // Section 5 — rows 30-36
  header(30, "5. CLOSING COSTS");
  label("A31", "Acquisition Closing % — enter yours");
  inputCell("B31", inputs.acqPct / 100, PERCENT);
  label("A32", "Lender Origination Points — enter yours");
  inputCell("B32", inputs.originationPts / 100, PERCENT);
  label("A33", "Disposition Closing % — enter yours");
  inputCell("B33", inputs.dispoPct / 100, PERCENT);
  label("A34", "Acquisition Cost $ (auto)");
  formulaCell("B34", "B11*B31", CURRENCY);
  label("A35", "Lender Points $ (auto)");
  formulaCell("B35", "B17*B32", CURRENCY);
  label("A36", "Disposition Cost $ (auto)");
  formulaCell("B36", "B5*B33", CURRENCY);

  // Section 6 — rows 38-42
  header(38, "6. PROFIT & MARGIN");
  label("A39", "Total Project Cost (auto)");
  formulaCell("B39", "B11+B6+B34+B35+B22+B28", CURRENCY);
  label("A40", "Sale Proceeds (auto)");
  formulaCell("B40", "B5-B36", CURRENCY);
  label("A41", "Profit (auto)");
  formulaCell("B41", "B40-B39", CURRENCY, true);
  label("A42", "Profit Margin % of ARV (auto)");
  formulaCell("B42", "B41/B5", PERCENT, true);

  // Stress test — rows 44-49 (uses columns A-D)
  header(44, "STRESS TEST — WHAT IF THE SALE PRICE COMES IN LOWER?");
  const stressHeaderRow = ws.getRow(45);
  ["ARV Change — enter your own scenarios", "Stressed ARV (auto)", "Stressed Profit (auto)", "Stressed Margin % (auto)"].forEach(
    (text, i) => {
      const cell = stressHeaderRow.getCell(i + 1);
      cell.value = text;
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SAND_LIGHT } };
    }
  );
  [0, 5, 10, 15].forEach((stressPct, i) => {
    const row = 46 + i;
    inputCell(`A${row}`, stressPct / 100, PERCENT);
    formulaCell(`B${row}`, `B5*(1-A${row})`, CURRENCY);
    formulaCell(`C${row}`, `B${row}-(B${row}*$B$33)-$B$39`, CURRENCY);
    formulaCell(`D${row}`, `C${row}/B${row}`, PERCENT, true);
  });

  ws.mergeCells("A51:D51");
  const disclaimer = ws.getCell("A51");
  disclaimer.value =
    "This spreadsheet is for planning purposes only and is not a quote, pre-qualification, or commitment to lend.";
  disclaimer.font = { italic: true, size: 9, color: { argb: "FF68735F" } };

  // Soft guardrail, not real security — no password, so anyone can
  // Unprotect in one click, but a stray keystroke won't blow away a
  // formula while someone's plugging in their own deal.
  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manna-lending-max-offer-calculator-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
