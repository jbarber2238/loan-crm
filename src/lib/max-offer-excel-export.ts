// Exports the Max Allowable Offer calculator's current numbers as a working,
// on-brand Excel file. Layout and formulas follow the approved design
// handoff's reference/Excel.dc.html and reference/build_xlsx_prototype.py —
// Max Allowable Offer leads, "Your planned offer" is optional, the lender
// panel says "up to" and never a quote, and a "Workings" tab holds the
// shared math (including the closed-form break-even offer) so the visible
// Calculator sheet stays uncluttered. Purchase price used downstream is
// `IF(offer blank, MAO, offer)`, computed live in Workings so it always
// tracks ARV/rehab/offer edits — the one correctness bug the old single-
// formula export had and this structure fixes by construction.
//
// Cell addresses below are hand-tracked (there's no "next row" helper that
// also knows formula references), so any row inserted/removed here has to
// be re-checked against every formula that references it.
//
// Uses exceljs rather than the xlsx (SheetJS) package already in this repo
// — SheetJS's free build writes formulas fine but silently drops cell
// fills/fonts and can't embed images, both confirmed by a real write+read
// round trip. exceljs supports styling, sheet protection, data validation,
// conditional formatting and image embedding natively, which real branding
// and the handoff's acceptance checklist both require.

import { APPLY_URL, COMPANY_PHONE, COMPANY_EMAIL } from "@/lib/lead-constants";
import { LTARV_CAP, type MaxOfferCalcInputs } from "@/lib/max-offer-calc";

const TEAL = "FF143D4A";
const GOLD_LIGHT = "FFF3E4C0";
const GOLD_EDGE = "FFC99A3D";
const WHITE = "FFFFFFFF";
const SAND_LIGHT = "FFEDE6DA";
const MOSS = "FF68735F";
const STATUS_GREEN_BG = "FFDDF0E4";
const STATUS_GREEN_FG = "FF1F5C3C";
const STATUS_AMBER_BG = "FFFBEBC8";
const STATUS_AMBER_FG = "FF6B4500";
const STATUS_RED_BG = "FFF8DDD9";
const STATUS_RED_FG = "FF8A2A22";

const CURRENCY = "$#,##0;($#,##0);-";
const PERCENT = "0.0%";

export type MaxOfferExcelInputs = MaxOfferCalcInputs;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function downloadMaxOfferExcel(inputs: MaxOfferExcelInputs): Promise<void> {
  const [ExcelJS, logoResponse] = await Promise.all([
    import("exceljs"),
    // The "reversed" (white) lockup, not the primary teal one — this sits on
    // the teal title band, where the teal-on-transparent version would be
    // invisible.
    fetch("/brand/manna-lending-onecolor-white-transparent.png").catch(() => null),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Manna Lending";

  const ws = wb.addWorksheet("Calculator", { views: [{ showGridLines: false }] });
  const wk = wb.addWorksheet("Workings", { views: [{ showGridLines: false }] });

  ws.columns = [{ width: 34 }, { width: 17 }, { width: 2 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 2 }, { width: 26 }, { width: 17 }];

  const F = "Arial";
  function font(size = 10, bold = false, color = "FF000000", italic = false) {
    return { name: F, size, bold, color: { argb: color }, italic };
  }
  function fill(argb: string) {
    return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
  }
  const thin = { style: "thin" as const, color: { argb: "FFE2DCCD" } };
  const GRID = { bottom: thin };
  const GOLD_BORDER = {
    top: { style: "thin" as const, color: { argb: GOLD_EDGE } },
    bottom: { style: "thin" as const, color: { argb: GOLD_EDGE } },
    left: { style: "thin" as const, color: { argb: GOLD_EDGE } },
    right: { style: "thin" as const, color: { argb: GOLD_EDGE } },
  };
  const LEFT = { horizontal: "left" as const, vertical: "middle" as const, indent: 1 };
  const RIGHT = { horizontal: "right" as const, vertical: "middle" as const, indent: 1 };
  const CENTER = { horizontal: "center" as const, vertical: "middle" as const };
  const WRAP = { horizontal: "left" as const, vertical: "top" as const, wrapText: true, indent: 1 };

  function put(sheet: typeof ws, addr: string, value: unknown, opts?: { font?: ReturnType<typeof font>; fill?: string; align?: object; numFmt?: string; border?: object }) {
    const cell = sheet.getCell(addr);
    cell.value = value as never;
    cell.font = opts?.font ?? font();
    if (opts?.fill) cell.fill = fill(opts.fill);
    if (opts?.align) cell.alignment = opts.align as never;
    if (opts?.numFmt) cell.numFmt = opts.numFmt;
    if (opts?.border) cell.border = opts.border as never;
    return cell;
  }

  function header(sheet: typeof ws, range: string, text: string) {
    sheet.mergeCells(range);
    const first = range.split(":")[0]!;
    put(sheet, first, text, { font: font(10, true, WHITE), fill: TEAL, align: LEFT });
    sheet.getRow(Number(first.match(/\d+/)![0])).height = 22;
  }

  function goldInput(addr: string, value: number | string | null, numFmt: string, note?: string) {
    const cell = put(ws, addr, value ?? "", { font: font(11, true, "FF0000FF"), fill: GOLD_LIGHT, align: RIGHT, numFmt, border: GOLD_BORDER });
    cell.protection = { locked: false };
    if (note) {
      cell.note = { texts: [{ text: note }], margins: { insetmode: "auto", inset: [0.1, 0.1, 0.1, 0.1] }, editAs: "absolute" };
    }
    return cell;
  }

  function label(addr: string, text: string) {
    put(ws, addr, text, { font: font(10), align: LEFT, border: GRID });
  }

  function formula(addr: string, f: string, numFmt: string, emphasize = false) {
    put(ws, addr, { formula: f }, { font: emphasize ? font(12, true, TEAL) : font(10), align: RIGHT, numFmt, border: GRID });
  }

  // --- Title band -----------------------------------------------------------
  ws.getRow(1).height = 60;
  ws.mergeCells("A1:I1");
  put(ws, "A1", "Max Allowable Offer Calculator", { font: font(18, true, WHITE), fill: TEAL, align: { ...LEFT } });
  ws.mergeCells("A2:I2");
  put(ws, "A2", "Type in the gold cells. Everything else updates. Cells with a red corner have a hover note.", {
    font: font(10, false, MOSS, true),
  });
  ws.getRow(2).height = 20;

  if (logoResponse?.ok) {
    const logoBuffer = await logoResponse.arrayBuffer();
    const imageId = wb.addImage({ base64: arrayBufferToBase64(logoBuffer), extension: "png" });
    ws.addImage(imageId, { tl: { col: 6.7, row: 0.15 }, ext: { width: 108, height: 41 } });
  }

  // --- Deal inputs (A:B rows 5-16) -------------------------------------------
  header(ws, "A4:B4", "DEAL INPUTS");
  label("A5", "After-repair value (ARV)");
  goldInput("B5", inputs.arv, CURRENCY, "What the property should sell for once the rehab is finished. Use recent comps.");
  label("A6", "Rehab budget");
  goldInput("B6", inputs.rehab, CURRENCY, "Your full renovation budget. Add a cushion for surprises.");
  label("A7", "Percent of ARV (70% rule)");
  goldInput(
    "B7",
    inputs.pctOfArv,
    PERCENT,
    "The 70% rule: most flippers will not pay more than 70% of ARV minus rehab. Move it up in a hot, low-risk market or down for a heavier rehab."
  );
  label("A8", "Months to sell");
  goldInput("B8", inputs.months, "0", "Months from closing to sale. Interest and holding costs run for this long.");
  label("A9", "Your planned offer (optional)");
  goldInput(
    "B9",
    inputs.offer && inputs.offer > 0 ? inputs.offer : null,
    CURRENCY,
    "Optional. Leave blank to see numbers at the max allowable offer only. Enter a price to see how it compares and what it does to your profit."
  );
  label("A10", "Interest rate (placeholder)");
  goldInput(
    "B10",
    inputs.rate,
    PERCENT,
    "A planning placeholder. Fix and flip bridge debt often runs 9.5%-12% simple interest, but real rates depend on the lender and the borrower."
  );
  label("A11", "Loan-to-cost");
  goldInput(
    "B11",
    inputs.ltc,
    PERCENT,
    "Without prior experience, typically 80%-90% depending on the lender. With experience, some options go up to 100%."
  );
  label("A12", "Taxes + insurance per year");
  goldInput("B12", inputs.taxesInsPerYear, CURRENCY, "Annual property taxes plus insurance, prorated over your timeline.");
  label("A13", "Misc. holding per month");
  goldInput("B13", inputs.miscPerMonth, CURRENCY, "Utilities, HOA dues, lawn care and snow removal in one rough monthly number.");
  label("A14", "Buying closing costs");
  goldInput("B14", inputs.acqPct, PERCENT, "Closing costs on the way in, excluding lender points. Use 1-2% for off-market deals, 3-7% for MLS deals.");
  label("A15", "Lender points (placeholder)");
  goldInput("B15", inputs.pointsPct, PERCENT, "A planning placeholder. Lender points vary a lot by lender and borrower.");
  label("A16", "Selling costs");
  goldInput("B16", inputs.sellPct, PERCENT, "Costs on the way out: realtor commissions and seller fees. As low as 3% with one agent, up to 7% with two.");

  // --- Result (D:F rows 5-16) -------------------------------------------------
  header(ws, "D4:F4", "RESULT");
  put(ws, "E5", "At the max", { font: font(10, true), fill: SAND_LIGHT, align: CENTER });
  put(ws, "F5", "At your offer", { font: font(10, true), fill: SAND_LIGHT, align: CENTER });
  put(ws, "D5", "", { fill: SAND_LIGHT });

  const OFFERED = "N($B$9)>0";
  function dual(row: number, label2: string, workingsRow: number, numFmt: string, opts?: { bold?: boolean; big?: boolean }) {
    put(ws, `D${row}`, label2, { font: font(10, opts?.bold), align: LEFT, border: GRID });
    formula(`E${row}`, `=Workings!B${workingsRow}`, numFmt, opts?.big);
    formula(`F${row}`, `=IF(${OFFERED},Workings!C${workingsRow},"-")`, numFmt, opts?.big);
  }
  dual(6, "Purchase price", 2, CURRENCY);
  put(ws, "D7", "Offer vs. the max", { font: font(10), align: LEFT, border: GRID });
  ws.mergeCells("E7:F7");
  put(
    ws,
    "E7",
    {
      formula:
        '=IF(N($B$9)<=0,"Enter an offer to compare",IF($B$9>E6+0.5,TEXT($B$9-E6,"$#,##0")&" over your max",IF($B$9<E6-0.5,TEXT(E6-$B$9,"$#,##0")&" under your max. Great job.","Right at your max.")))',
    },
    { font: font(10, true, TEAL), align: RIGHT, border: GRID }
  );
  dual(8, "Total project cost", 14, CURRENCY);
  dual(9, "Projected profit", 15, CURRENCY, { bold: true, big: true });
  dual(10, "Profit margin (% of ARV)", 17, PERCENT);
  dual(11, "Cash you put in", 16, CURRENCY);
  dual(12, "Cash-on-cash return", 18, PERCENT);
  dual(13, "Status (15%+ is on target)", 19, "@");
  ws.getCell("E13").alignment = CENTER;
  ws.getCell("F13").alignment = CENTER;
  ws.mergeCells("D14:F14");
  put(
    ws,
    "D14",
    {
      formula:
        '=IF(Workings!B19="On target","At the max, this deal pencils.",IF(Workings!B19="Thin","At the max, the margin is thin. Try a lower price or a smaller rehab.","At the max, this deal does not pencil."))',
    },
    { font: font(10, true, TEAL), align: { horizontal: "left", vertical: "middle", indent: 1, wrapText: true } }
  );
  put(ws, "D15", "Profit change vs. buying at the max", { font: font(10), align: LEFT, border: GRID });
  ws.mergeCells("E15:F15");
  put(ws, "E15", { formula: "=IF(N($B$9)>0,Workings!C15-Workings!B15,\"-\")" }, { font: font(10, true), align: RIGHT, numFmt: "+$#,##0;-$#,##0;$0", border: GRID });
  put(ws, "D16", "Break-even offer (profit hits zero)", { font: font(10), align: LEFT, border: GRID });
  ws.mergeCells("E16:F16");
  put(ws, "E16", { formula: "=Workings!B25" }, { font: font(10, true), align: RIGHT, numFmt: CURRENCY, border: GRID });

  // --- Lender block (H:I) -----------------------------------------------------
  header(ws, "H4:I4", "HOW MUCH COULD YOU BORROW?");
  const lender: [number, string, string, string, boolean][] = [
    [5, "Up to (if you qualify)", "=Workings!C7", CURRENCY, true],
    [6, "Based on buying at", '=IF(N($B$9)>0,"your offer","the max")', "@", false],
    [7, "Limited by", "=Workings!C8", "@", false],
    [8, "Loan as % of ARV", "=IF($B$5>0,Workings!C7/$B$5,0)", PERCENT, false],
    [9, "You would put in about", "=Workings!C16", CURRENCY, false],
  ];
  for (const [row, text, f, numFmt, big] of lender) {
    put(ws, `H${row}`, text, { font: font(10, big), align: LEFT, border: GRID });
    formula(`I${row}`, f, numFmt, big);
  }
  ws.mergeCells("H10:I12");
  put(
    ws,
    "H10",
    "Under qualifying circumstances only. Your actual terms depend on your credit score (FICO), the flips you have completed, and the lender and program you choose. Rates and points vary.",
    { font: font(9, false, MOSS, true), align: WRAP }
  );
  ws.mergeCells("H13:I15");
  put(
    ws,
    "H13",
    "This is not a quote, pre-qualification or commitment to lend. All loans are subject to underwriting and verification of experience.",
    { font: font(9, true, "FF17414F"), fill: "FFF1EBDD", align: WRAP }
  );
  for (const row of ws.getRows(13, 3) ?? []) {
    row.getCell("H").fill = fill("FFF1EBDD");
    row.getCell("I").fill = fill("FFF1EBDD");
  }
  header(ws, "H16:I16", "NEXT STEP");
  ws.mergeCells("H17:I17");
  const cta = put(ws, "H17", "", { font: font(11, true, "FF143D4A"), fill: GOLD_EDGE, align: CENTER });
  cta.value = { text: "See what you qualify for  >", hyperlink: APPLY_URL };
  ws.mergeCells("H18:I18");
  put(ws, "H18", `Text or call ${COMPANY_PHONE}`, { font: font(10), align: CENTER });

  // --- Where the money goes (A:B rows 19-27) ----------------------------------
  header(ws, "A19:B19", "WHERE THE MONEY GOES");
  const money: [string, number][] = [
    ["Purchase price", 2],
    ["Rehab", 3],
    ["Buying closing costs", 11],
    ["Lender points", 12],
    ["Loan interest", 9],
    ["Holding costs", 10],
    ["Selling costs", 13],
    ["Your profit", 15],
  ];
  money.forEach(([text, workingsRow], i) => {
    const row = 20 + i;
    const last = text === "Your profit";
    put(ws, `A${row}`, text, { font: font(10, last), align: LEFT, border: GRID });
    formula(`B${row}`, `=Workings!C${workingsRow}`, CURRENCY, last);
    if (last) ws.getCell(`B${row}`).font = font(10, true, STATUS_GREEN_FG);
  });
  ws.mergeCells("A28:B28");
  put(ws, "A28", { formula: '="Based on buying at "&IF(N($B$9)>0,"your offer","the max allowable offer")' }, { font: font(9, false, MOSS, true) });

  // --- Stress test (D:I rows 19-25) -------------------------------------------
  header(ws, "D19:I19", "IF THE SALE PRICE COMES IN LOWER");
  put(ws, "D20", "Scenario (edit the gold %)", { font: font(10, true), fill: SAND_LIGHT, align: LEFT });
  put(ws, "E20", "Sale price", { font: font(10, true), fill: SAND_LIGHT, align: RIGHT });
  put(ws, "F20", "Profit", { font: font(10, true), fill: SAND_LIGHT, align: RIGHT });
  put(ws, "G20", "", { fill: SAND_LIGHT });
  put(ws, "H20", "Margin", { font: font(10, true), fill: SAND_LIGHT, align: RIGHT });
  put(ws, "I20", "Status", { font: font(10, true), fill: SAND_LIGHT, align: CENTER });
  [0, 0.05, 0.1, 0.15].forEach((drop, i) => {
    const row = 21 + i;
    const cell = put(ws, `D${row}`, drop, {
      font: font(10, true, "FF0000FF"),
      fill: GOLD_LIGHT,
      align: LEFT,
      numFmt: '[=0]"As planned";"Sale price "0%" lower"',
      border: GOLD_BORDER,
    });
    cell.protection = { locked: false };
    formula(`E${row}`, `=$B$5*(1-D${row})`, CURRENCY);
    formula(`F${row}`, `=E${row}-E${row}*$B$16-Workings!$C$14`, CURRENCY, true);
    formula(`H${row}`, `=IF(E${row}>0,F${row}/E${row},0)`, PERCENT, true);
    put(ws, `I${row}`, { formula: `=IF(H${row}>=Workings!$F$3,"On target",IF(H${row}>=Workings!$F$4,"Thin","Below target"))` }, {
      font: font(10, true),
      align: CENTER,
      border: GRID,
    });
  });
  ws.mergeCells("D25:I25");
  put(
    ws,
    "D25",
    "The loan and costs stay the same. Only the sale price and selling costs move. Based on buying at your offer if entered, otherwise the max.",
    { font: font(9, false, MOSS, true) }
  );

  // --- Footer ------------------------------------------------------------------
  ws.mergeCells("A30:I30");
  put(ws, "A30", `Questions about a deal? Text or call ${COMPANY_PHONE} or email ${COMPANY_EMAIL}`, { font: font(10, true) });
  ws.mergeCells("A31:I31");
  put(
    ws,
    "A31",
    "For planning purposes only. This is not a quote, pre-qualification or commitment to lend. Manna Lending is a lending brokerage, not a lender. Investor and business-purpose loans only.",
    { font: font(9, false, MOSS, true) }
  );

  // --- Conditional formatting ----------------------------------------------
  const STATUS_RULES: [string, string, string][] = [
    ["On target", STATUS_GREEN_BG, STATUS_GREEN_FG],
    ["Thin", STATUS_AMBER_BG, STATUS_AMBER_FG],
    ["Below target", STATUS_RED_BG, STATUS_RED_FG],
  ];
  for (const range of ["E13:F13", "I21:I24"]) {
    for (const [text, bg, fg] of STATUS_RULES) {
      ws.addConditionalFormatting({
        ref: range,
        rules: [
          {
            type: "cellIs",
            operator: "equal",
            formulae: [`"${text}"`],
            style: { fill: fill(bg), font: { name: F, bold: true, color: { argb: fg } } },
            priority: 1,
          },
        ],
      });
    }
  }
  ws.addConditionalFormatting({
    ref: "E7:F7",
    rules: [
      {
        type: "cellIs",
        operator: "equal",
        formulae: ['"Enter an offer to compare"'],
        style: { font: { name: F, italic: true, color: { argb: MOSS } } },
        priority: 1,
      },
    ],
  });

  // --- Data validation --------------------------------------------------------
  // exceljs' DataValidation lives per-cell (no worksheet-level range setter
  // in this version), so a "range" ref like "D21:D24" is expanded and
  // applied to each cell individually.
  function expandRange(ref: string): string[] {
    if (!ref.includes(":")) return [ref];
    const [start, end] = ref.split(":") as [string, string];
    const [, startCol, startRow] = start.match(/^([A-Z]+)(\d+)$/)!;
    const [, endCol, endRow] = end.match(/^([A-Z]+)(\d+)$/)!;
    if (startCol !== endCol) throw new Error(`expandRange only supports single-column ranges, got ${ref}`);
    const addrs: string[] = [];
    for (let r = Number(startRow); r <= Number(endRow); r++) addrs.push(`${startCol}${r}`);
    return addrs;
  }
  function dv(ref: string, opts: { type: "decimal" | "whole"; operator: "greaterThanOrEqual" | "between"; formulae: string[]; error: string }) {
    for (const addr of expandRange(ref)) {
      ws.getCell(addr).dataValidation = {
        type: opts.type,
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Check this number",
        operator: opts.operator,
        formulae: opts.formulae,
        error: opts.error,
      };
    }
  }
  dv("B5", { type: "decimal", operator: "greaterThanOrEqual", formulae: ["0"], error: "Enter a dollar amount of 0 or more." });
  dv("B6", { type: "decimal", operator: "greaterThanOrEqual", formulae: ["0"], error: "Enter a dollar amount of 0 or more." });
  dv("B7", { type: "decimal", operator: "between", formulae: ["0.4", "1"], error: "Enter a percent between 40% and 100%. The classic rule is 70%." });
  dv("B8", { type: "whole", operator: "between", formulae: ["1", "36"], error: "Enter a whole number of months from 1 to 36." });
  dv("B9", { type: "decimal", operator: "greaterThanOrEqual", formulae: ["0"], error: "Enter a dollar amount, or leave blank." });
  dv("B10", { type: "decimal", operator: "between", formulae: ["0", "0.3"], error: "Enter a rate between 0% and 30%." });
  dv("B11", { type: "decimal", operator: "between", formulae: ["0", "1"], error: "Enter a loan-to-cost between 0% and 100%." });
  dv("B12", { type: "decimal", operator: "greaterThanOrEqual", formulae: ["0"], error: "Enter a dollar amount of 0 or more." });
  dv("B13", { type: "decimal", operator: "greaterThanOrEqual", formulae: ["0"], error: "Enter a dollar amount of 0 or more." });
  dv("B14", { type: "decimal", operator: "between", formulae: ["0", "0.15"], error: "Enter a percent between 0% and 15%." });
  dv("B15", { type: "decimal", operator: "between", formulae: ["0", "0.1"], error: "Enter lender points as a percent of the loan, 0% to 10%." });
  dv("B16", { type: "decimal", operator: "between", formulae: ["0", "0.2"], error: "Enter a percent between 0% and 20%." });
  dv("D21:D24", { type: "decimal", operator: "between", formulae: ["0", "0.5"], error: "Enter a drop between 0% and 50%." });

  // --- Page setup / protection --------------------------------------------
  ws.pageSetup.orientation = "landscape";
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 1;
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.printArea = "A1:I31";
  // Soft guardrail, not real security — no password, so anyone can
  // Unprotect in one click, but a stray keystroke won't blow away a
  // formula while someone's plugging in their own deal.
  ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });

  // ================= Workings =================
  wk.columns = [{ width: 34 }, { width: 18 }, { width: 24 }, { width: 3 }, { width: 34 }, { width: 12 }];
  function wput(addr: string, value: unknown, opts?: { font?: ReturnType<typeof font>; fill?: string; align?: object; numFmt?: string }) {
    const cell = wk.getCell(addr);
    cell.value = value as never;
    cell.font = opts?.font ?? font();
    if (opts?.fill) cell.fill = fill(opts.fill);
    if (opts?.align) cell.alignment = opts.align as never;
    if (opts?.numFmt) cell.numFmt = opts.numFmt;
    return cell;
  }
  wput("A1", "Item", { font: font(10, true, WHITE), fill: TEAL });
  wput("B1", "At the max", { font: font(10, true, WHITE), fill: TEAL, align: CENTER });
  wput("C1", "At your offer (or the max if blank)", { font: font(10, true, WHITE), fill: TEAL, align: CENTER });

  wput("A2", "Purchase price", { align: LEFT });
  wput("B2", { formula: "=MAX(0,Calculator!$B$7*Calculator!$B$5-Calculator!$B$6)" }, { numFmt: CURRENCY, align: RIGHT });
  wput("C2", { formula: "=IF(N(Calculator!$B$9)>0,Calculator!$B$9,B2)" }, { numFmt: CURRENCY, align: RIGHT });

  const WK_ROWS: [number, string, string, string][] = [
    [3, "Rehab", "=Calculator!$B$6", CURRENCY],
    [4, "Loan-to-cost used", "=Calculator!$B$11", PERCENT],
    [5, "Loan by loan-to-cost", "=({c}2+{c}3)*{c}4", CURRENCY],
    [6, "Loan by loan-to-ARV cap", "=Calculator!$B$5*$F$2", CURRENCY],
    [7, "Loan (up to)", "=MIN({c}5,{c}6)", CURRENCY],
    [8, "Limited by", '=IF({c}5<={c}6,"Loan-to-cost","Loan-to-ARV")', "@"],
    [9, "Loan interest (simple, full loan)", "={c}7*Calculator!$B$10*Calculator!$B$8/12", CURRENCY],
    [10, "Holding costs", "=(Calculator!$B$12/12+Calculator!$B$13)*Calculator!$B$8", CURRENCY],
    [11, "Buying closing costs", "={c}2*Calculator!$B$14", CURRENCY],
    [12, "Lender points ($)", "={c}7*Calculator!$B$15", CURRENCY],
    [13, "Selling costs", "=Calculator!$B$5*Calculator!$B$16", CURRENCY],
    [14, "Total project cost", "={c}2+{c}3+{c}11+{c}12+{c}9+{c}10", CURRENCY],
    [15, "Profit", "=Calculator!$B$5-{c}13-{c}14", CURRENCY],
    [16, "Cash you put in", "={c}14-{c}7", CURRENCY],
    [17, "Profit margin (% of ARV)", "=IF(Calculator!$B$5>0,{c}15/Calculator!$B$5,0)", PERCENT],
    [18, "Cash-on-cash return", "=IF({c}16<=0,0,{c}15/{c}16)", PERCENT],
    [19, "Status", '=IF({c}17>=$F$3,"On target",IF({c}17>=$F$4,"Thin","Below target"))', "@"],
  ];
  for (const [row, text, f, numFmt] of WK_ROWS) {
    wput(`A${row}`, text, { align: LEFT });
    for (const c of ["B", "C"]) {
      wput(`${c}${row}`, { formula: f.replaceAll("{c}", c) }, { numFmt, align: RIGHT });
    }
  }

  wput("A21", "Break-even offer workings", { font: font(10, true, "FF143D4A") });
  wput("A22", "Interest + points as a share of the loan", { align: LEFT });
  wput("B22", { formula: "=Calculator!$B$10*Calculator!$B$8/12+Calculator!$B$15" }, { numFmt: "0.0000", align: RIGHT });
  wput("A23", "Break-even if loan-to-cost limits the loan", { align: LEFT });
  wput("B23", { formula: "=(Calculator!$B$5-B13-B3-B10-B3*B4*B22)/(1+Calculator!$B$14+B4*B22)" }, { numFmt: CURRENCY, align: RIGHT });
  wput("A24", "Break-even if the loan-to-ARV cap limits the loan", { align: LEFT });
  wput("B24", { formula: "=(Calculator!$B$5-B13-B3-B10-B6*B22)/(1+Calculator!$B$14)" }, { numFmt: CURRENCY, align: RIGHT });
  wput("A25", "Break-even offer", { font: font(10, true), align: LEFT });
  wput("B25", { formula: "=MAX(0,IF((B23+B3)*B4<=B6,B23,B24))" }, { font: font(10, true), numFmt: CURRENCY, align: RIGHT });

  wput("E1", "Constants (change here if lender norms change)", { font: font(10, true, WHITE), fill: TEAL });
  wk.getCell("F1").fill = fill(TEAL);
  const consts: [number, string, number, string][] = [
    [2, "Loan-to-ARV cap", LTARV_CAP, "The hard ceiling almost every hard money lender holds to, regardless of experience (per the Manna calculator page)."],
    [3, "Target margin (on target at or above)", 0.15, "Target profit margin is typically 15-20% of ARV."],
    [4, "Thin margin (thin at or above)", 0.1, "Below this, the deal is marked Below target."],
  ];
  for (const [row, text, value, note] of consts) {
    wput(`E${row}`, text);
    const cell = wput(`F${row}`, value, { font: font(10, true, "FF0000FF"), fill: GOLD_LIGHT, align: RIGHT, numFmt: PERCENT });
    cell.note = { texts: [{ text: note }], margins: { insetmode: "auto", inset: [0.1, 0.1, 0.1, 0.1] } };
  }
  wput("E7", "This tab feeds the Calculator tab. Nothing here needs to be changed for a normal deal.", { font: font(9, false, MOSS, true) });

  wk.protect("", { selectLockedCells: true, selectUnlockedCells: true });
  for (const row of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25]) {
    wk.getCell(`B${row}`).protection = { locked: true };
    wk.getCell(`C${row}`).protection = { locked: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manna-lending-max-offer-calculator-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
