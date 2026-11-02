import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import { borderToCss, colorToCss, columnWidthPx, rowHeightPx, themePaletteFromXml, type ThemePalette, type XlBorderSide, type XlColor } from "@/lib/spreadsheet-styles";

const MAX_ROWS = 1000;
const MAX_COLUMNS = 40;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const STYLE = `
:root { color-scheme: light dark; }
body { margin: 0; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; background: Canvas; color: CanvasText; }
nav { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: Canvas; border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, transparent); }
nav a { padding: 3px 10px; border-radius: 999px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); color: inherit; text-decoration: none; }
section { padding: 12px; }
h2 { margin: 0 0 8px; font-size: 14px; }
.note { margin: 0 0 8px; opacity: .7; }
.wrap { overflow-x: auto; }
table { border-collapse: collapse; }
td, th { border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); padding: 3px 8px; white-space: nowrap; vertical-align: top; }
tr:first-child td { font-weight: 600; background: color-mix(in srgb, CanvasText 8%, transparent); }
`;

function page(body: string, nav = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spreadsheet preview</title><style>${STYLE}</style></head><body>${nav}${body}</body></html>`;
}

/**
 * A spreadsheet's sheets as HTML tables, one section per sheet with a link bar across the top. Long sheets are cut
 * at {MAX_ROWS} rows and {MAX_COLUMNS} columns, with a note, so a huge file can't freeze the review window.
 * Pass null for a file that couldn't be read.
 */
export async function renderSpreadsheetHtml(buffer: Buffer | null, fileName: string): Promise<string> {
  if (!buffer) {
    return page(`<section><p>This spreadsheet couldn't be shown here. Use Download to open it in Excel.</p><p class="note">${escapeHtml(fileName)}</p></section>`);
  }
  // Modern Excel files keep their look (colors, borders, column widths, merged cells, logos). Older formats and CSV
  // carry no usable styling, so they, and any file the styled view can't read, fall back to plain tables.
  if (/\.(?:xlsx|xlsm)$/i.test(fileName)) {
    try {
      const styled = await renderStyledWorkbook(buffer);
      if (styled) return styled;
    } catch (err) {
      console.error("Styled spreadsheet preview failed, using plain tables:", err);
    }
  }
  return renderPlainTables(buffer);
}

const SHEET_STYLE = `
:root { color-scheme: light; }
body { margin: 0; background: #fff; color: #000; font: 11pt Calibri, Carlito, "Segoe UI", Arial, sans-serif; }
nav { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px; background: #f3f3f3; border-bottom: 1px solid #c8c8c8; font: 12px system-ui, sans-serif; }
nav a { padding: 2px 10px; border: 1px solid #c8c8c8; border-radius: 3px; background: #fff; color: #217346; text-decoration: none; }
.note { margin: 6px 10px; font: 12px system-ui, sans-serif; color: #666; }
.sheet { position: relative; margin: 0 0 24px; }
table { border-collapse: collapse; table-layout: fixed; }
td { padding: 0 3px; overflow: hidden; white-space: nowrap; vertical-align: bottom; }
td.spill { overflow: visible; position: relative; z-index: 1; }
td.wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
.grid td { border: 1px solid #e1e1e1; }
img { position: absolute; max-width: none; }
`;

type FormatNumber = (code: string, value: number) => string;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** What a cell shows: numbers and dates in the number format the file chose ($1,250.50, 12%, 8/26/19), anything else as typed. */
function cellText(cell: Cell, format?: FormatNumber): string {
  try {
    const raw = cell.value;
    const value = typeof raw === "object" && raw !== null && !(raw instanceof Date) && "result" in raw ? raw.result : raw;
    if (format && (typeof value === "number" || value instanceof Date)) {
      const serial = value instanceof Date ? (value.getTime() - EXCEL_EPOCH_MS) / 86_400_000 : value;
      return format(cell.numFmt || (value instanceof Date ? "m/d/yyyy" : "General"), serial);
    }
    return cell.text ?? "";
  } catch {
    try {
      return cell.text ?? "";
    } catch {
      return "";
    }
  }
}

const isNumericValue = (v: CellValue): boolean => typeof v === "number" || v instanceof Date || (typeof v === "object" && v !== null && "result" in v && typeof v.result === "number");

function cellCss(cell: Cell, theme: ThemePalette): string {
  const css: string[] = [];
  const fill = cell.fill as { type?: string; pattern?: string; fgColor?: XlColor } | undefined;
  const background = fill?.type === "pattern" && fill.pattern === "solid" ? colorToCss(fill.fgColor, theme) : null;
  if (background) css.push(`background:${background}`);
  const font = cell.font ?? {};
  const text = colorToCss(font.color as XlColor | undefined, theme);
  if (text) css.push(`color:${text}`);
  if (font.bold) css.push("font-weight:700");
  if (font.italic) css.push("font-style:italic");
  const decorations = [font.underline ? "underline" : "", font.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (decorations) css.push(`text-decoration:${decorations}`);
  if (font.size) css.push(`font-size:${font.size}pt`);
  if (font.name && /^[\w ]+$/.test(font.name)) css.push(`font-family:"${font.name}",Calibri,Carlito,Arial,sans-serif`);
  const align = cell.alignment ?? {};
  const horizontal: string | null = align.horizontal && (align.horizontal as string) !== "general" ? align.horizontal : isNumericValue(cell.value) ? "right" : null;
  if (horizontal) css.push(`text-align:${horizontal === "centerContinuous" ? "center" : horizontal === "fill" || horizontal === "distributed" ? "left" : horizontal}`);
  if (align.vertical) css.push(`vertical-align:${align.vertical === "middle" ? "middle" : align.vertical === "top" ? "top" : "bottom"}`);
  if (align.indent) css.push(`padding-left:${3 + align.indent * 9}px`);
  const border = (cell.border ?? {}) as Partial<Record<"top" | "left" | "bottom" | "right", XlBorderSide>>;
  for (const side of ["top", "left", "bottom", "right"] as const) {
    const value = borderToCss(border[side], theme);
    if (value) css.push(`border-${side}:${value}`);
  }
  return css.join(";");
}

function hasLook(cell: Cell): boolean {
  const fill = cell.fill as { type?: string } | undefined;
  return Boolean(fill?.type) || Boolean(cell.border && Object.keys(cell.border).length);
}

function renderStyledSheet(workbook: Workbook, ws: Worksheet, theme: ThemePalette, index: number, format: FormatNumber): { html: string; empty: boolean } {
  // How far the sheet really goes: cells with something in them or a look of their own, not the file's blank formatted tail.
  let lastRow = 0;
  let lastCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      if (cellText(cell, format) !== "" || hasLook(cell)) {
        lastRow = Math.max(lastRow, r);
        lastCol = Math.max(lastCol, c);
      }
    });
  });
  if (lastRow === 0) return { html: "", empty: true };
  const cut = lastRow > MAX_ROWS || lastCol > MAX_COLUMNS;
  lastRow = Math.min(lastRow, MAX_ROWS);
  lastCol = Math.min(lastCol, MAX_COLUMNS);

  // Merged ranges: the top-left cell spans, the rest are skipped.
  const spans = new Map<string, { rows: number; cols: number }>();
  const covered = new Set<string>();
  for (const range of (ws.model as { merges?: string[] }).merges ?? []) {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const col = (letters: string) => letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const [c1, r1, c2, r2] = [col(m[1]), Number(m[2]), col(m[3]), Number(m[4])];
    spans.set(`${r1}:${c1}`, { rows: r2 - r1 + 1, cols: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r}:${c}`);
  }

  const widths: number[] = [];
  for (let c = 1; c <= lastCol; c++) {
    const col = ws.getColumn(c);
    widths.push(col.hidden ? 0 : columnWidthPx(col.width ?? (ws.properties.defaultColWidth as number | undefined)));
  }
  const heights: number[] = [];
  const rowsHtml: string[] = [];
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const height = row.hidden ? 0 : rowHeightPx(row.height ?? (ws.properties.defaultRowHeight as number | undefined));
    heights.push(height);
    if (row.hidden) continue;
    const cells: string[] = [];
    for (let c = 1; c <= lastCol; c++) {
      if (covered.has(`${r}:${c}`) || widths[c - 1] === 0) continue;
      const cell = row.getCell(c);
      const span = spans.get(`${r}:${c}`);
      const text = cellText(cell, format);
      const wrap = Boolean(cell.alignment?.wrapText);
      // Text that runs past its cell shows over the empty cells beside it, like Excel does.
      const next = c < lastCol ? row.getCell(c + 1) : null;
      const spill = !wrap && text !== "" && !span && !isNumericValue(cell.value) && next !== null && cellText(next, format) === "" && !hasLook(next);
      const attrs = [span && span.cols > 1 ? ` colspan="${span.cols}"` : "", span && span.rows > 1 ? ` rowspan="${span.rows}"` : "", wrap || spill ? ` class="${[wrap ? "wrap" : "", spill ? "spill" : ""].filter(Boolean).join(" ")}"` : ""].join("");
      const css = cellCss(cell, theme);
      cells.push(`<td${attrs}${css ? ` style="${css}"` : ""}>${escapeHtml(text)}</td>`);
    }
    rowsHtml.push(`<tr style="height:${height}px">${cells.join("")}</tr>`);
  }

  // Pictures (a lender's logo, say), placed by their position in the sheet.
  const x = (col: number, offsetEmu: number) => widths.slice(0, col).reduce((a, b) => a + b, 0) + offsetEmu / 9525;
  const y = (row: number, offsetEmu: number) => heights.slice(0, row).reduce((a, b) => a + b, 0) + offsetEmu / 9525;
  const pictures: string[] = [];
  for (const picture of ws.getImages()) {
    const image = workbook.getImage(Number(picture.imageId));
    const data = image?.buffer ? Buffer.from(image.buffer as unknown as ArrayBuffer).toString("base64") : image?.base64;
    if (!data || !image || !["png", "jpeg", "gif"].includes(image.extension)) continue;
    const { tl, br } = picture.range as { tl: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number }; br?: typeof picture.range.br; ext?: { width: number; height: number } };
    const ext = (picture.range as { ext?: { width: number; height: number } }).ext;
    const left = x(tl.nativeCol, tl.nativeColOff);
    const top = y(tl.nativeRow, tl.nativeRowOff);
    const width = br ? x(br.nativeCol, br.nativeColOff) - left : ext?.width;
    const height = br ? y(br.nativeRow, br.nativeRowOff) - top : ext?.height;
    if (!width || !height || width <= 0 || height <= 0) continue;
    pictures.push(`<img alt="" src="data:image/${image.extension};base64,${data}" style="left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px">`);
  }

  const gridlines = ws.views?.[0]?.showGridLines !== false;
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => `<col style="width:${w}px">`).join("");
  const note = cut ? `<p class="note">Showing the first ${MAX_ROWS.toLocaleString("en-US")} rows and ${MAX_COLUMNS} columns. Download the file to see everything.</p>` : "";
  const html = `<section id="sheet-${index}">${note}<div style="overflow-x:auto"><div class="sheet" style="width:${totalWidth}px"><table class="${gridlines ? "grid" : ""}" style="width:${totalWidth}px"><colgroup>${cols}</colgroup><tbody>${rowsHtml.join("")}</tbody></table>${pictures.join("")}</div></div></section>`;
  return { html, empty: false };
}

async function renderStyledWorkbook(buffer: Buffer): Promise<string | null> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const XLSX = await import("xlsx");
  const format: FormatNumber = (code, value) => XLSX.SSF.format(code, value);
  const theme = themePaletteFromXml((workbook as unknown as { model?: { themes?: Record<string, string> } }).model?.themes?.theme1);
  const sections: string[] = [];
  const links: string[] = [];
  workbook.worksheets.forEach((ws, i) => {
    if (ws.state && ws.state !== "visible") return;
    const { html, empty } = renderStyledSheet(workbook, ws, theme, i, format);
    if (empty) return;
    links.push(`<a href="#sheet-${i}">${escapeHtml(ws.name)}</a>`);
    sections.push(html);
  });
  if (sections.length === 0) return null;
  const nav = links.length > 1 ? `<nav>${links.join("")}</nav>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spreadsheet preview</title><style>${SHEET_STYLE}</style></head><body>${nav}${sections.join("")}</body></html>`;
}

async function renderPlainTables(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sections: string[] = [];
  const links: string[] = [];

  workbook.SheetNames.forEach((name, i) => {
    const sheet = workbook.Sheets[name];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const rows = range.e.r - range.s.r + 1;
    const columns = range.e.c - range.s.c + 1;
    const cut = rows > MAX_ROWS || columns > MAX_COLUMNS;
    if (cut) {
      range.e.r = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
      range.e.c = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
      sheet["!ref"] = XLSX.utils.encode_range(range);
    }
    // sheet_to_html escapes the cell text; the table is the only markup it adds.
    const table = XLSX.utils.sheet_to_html(sheet, { header: "", footer: "" });
    const id = `sheet-${i}`;
    links.push(`<a href="#${id}">${escapeHtml(name)}</a>`);
    sections.push(
      `<section id="${id}"><h2>${escapeHtml(name)}</h2>${cut ? `<p class="note">Showing the first ${MAX_ROWS.toLocaleString("en-US")} rows and ${MAX_COLUMNS} columns. Download the file to see everything.</p>` : ""}<div class="wrap">${table}</div></section>`
    );
  });

  if (sections.length === 0) return page(`<section><p>This spreadsheet is empty.</p></section>`);
  return page(sections.join(""), links.length > 1 ? `<nav>${links.join("")}</nav>` : "");
}
