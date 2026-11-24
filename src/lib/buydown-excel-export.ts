// The "Download Excel" file for the rate buy-down calculator: a pre-filled copy of the ORIGINAL workbook. Only the
// input cells and their cached results are patched; formulas, styles, the payment-type dropdown and the hidden
// sheet are left alone, and Excel is told to recalculate on open. Ported from the design handoff
// (logic/calculator-logic.js). Dependency-free: the workbook's files are stored unzipped and re-zipped here with no
// compression, which every spreadsheet app reads.

import { model, workbookVerdict, type BuydownInputs } from "@/lib/buydown-calc";

export const BUYDOWN_EXCEL_FILENAME = "Manna-Rate-Buy-Down-Break-Even.xlsx";

function b64Text(b: string): string {
  const s = atob(b);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return new TextDecoder().decode(a);
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A cell value: a number, literal text, or `{ s }` for an entry in the workbook's shared-strings table. */
type CellValue = number | string | { s: number };

/** Replaces one cell's value in a sheet's XML, keeping its style and (for calculated cells) its formula. */
function setCell(xml: string, ref: string, val: CellValue): string {
  const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)');
  return xml.replace(re, (_all: string, attrs: string, inner: string | undefined) => {
    const sm = attrs.match(/\ss="(\d+)"/);
    const sa = sm ? ' s="' + sm[1] + '"' : "";
    const fm = inner ? inner.match(/<f[^>]*?\/>|<f[^>]*>[\s\S]*?<\/f>/) : null;
    const f = fm ? fm[0] : "";
    if (typeof val === "object") return '<c r="' + ref + '"' + sa + ' t="s"><v>' + val.s + "</v></c>";
    if (typeof val === "string") return '<c r="' + ref + '"' + sa + ' t="str">' + f + "<v>" + xmlEsc(val) + "</v></c>";
    return '<c r="' + ref + '"' + sa + ">" + f + "<v>" + String(val) + "</v></c>";
  });
}

function workbookFiles(partsB64: Record<string, string>, o: BuydownInputs, hold: number, holds: number[]) {
  const m = model(o);
  const at = m.at(hold);
  const P: Record<string, string> = {};
  for (const k of Object.keys(partsB64)) P[k] = b64Text(partsB64[k]);

  // "Calculator" tab: the inputs...
  let s1 = P["xl/worksheets/sheet1.xml"];
  s1 = setCell(s1, "B5", o.L);
  s1 = setCell(s1, "B6", o.r0);
  s1 = setCell(s1, "B7", o.r1);
  s1 = setCell(s1, "B8", o.T);
  // Shared strings 0 and 2 are the dropdown's "Amortizing" and "Interest-only".
  s1 = setCell(s1, "B9", { s: o.io ? 2 : 0 });
  s1 = setCell(s1, "B12", o.pts);
  s1 = setCell(s1, "B13", o.extra);
  s1 = setCell(s1, "B14", o.same);
  s1 = setCell(s1, "B17", hold);
  // ...and the cached results, for viewers that never recalculate (previews, phones).
  const vals: Record<string, CellValue> = {
    B20: m.up,
    B21: m.p0,
    B22: m.p1,
    B23: m.save,
    B24: m.be === null ? "Never" : m.be,
    B25: m.be === null ? "Never" : m.be / 12,
    B26: o.same,
    B27: o.same + m.up,
    B30: at.saved,
    B31: at.b0,
    B32: at.b1,
    B33: at.b0 - at.b1,
    B34: at.net,
    B35: workbookVerdict(m, hold),
  };
  for (const r of Object.keys(vals)) s1 = setCell(s1, r, vals[r]);

  // "By Hold Time" tab: seven hold times, rows 5 to 11.
  let s2 = P["xl/worksheets/sheet2.xml"];
  holds.slice(0, 7).forEach((k, i) => {
    const r = 5 + i;
    const a = m.at(k);
    s2 = setCell(s2, "A" + r, k);
    s2 = setCell(s2, "B" + r, k / 12);
    s2 = setCell(s2, "C" + r, a.saved);
    s2 = setCell(s2, "D" + r, a.pay);
    s2 = setCell(s2, "E" + r, m.up);
    s2 = setCell(s2, "F" + r, a.net);
  });

  P["xl/worksheets/sheet1.xml"] = s1;
  P["xl/worksheets/sheet2.xml"] = s2;
  P["xl/workbook.xml"] = P["xl/workbook.xml"].replace("<calcPr/>", '<calcPr fullCalcOnLoad="1"/>');
  const names = Object.keys(P).sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
  const enc = new TextEncoder();
  return names.map((name) => ({ name, data: enc.encode(P[name]) }));
}

let crcTable: number[] | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c2 = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c2 = crcTable[(c2 ^ bytes[i]) & 255] ^ (c2 >>> 8);
  return (c2 ^ 0xffffffff) >>> 0;
}

/** A plain (stored, uncompressed) zip file. */
function makeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const file of files) {
    const nb = enc.encode(file.name);
    const crc = crc32(file.data);
    const sz = file.data.length;
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nb.length), ...u16(0)];
    parts.push(new Uint8Array(local), nb, file.data);
    central.push(
      new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]),
      nb
    );
    offset += local.length + nb.length + sz;
  }
  let csize = 0;
  for (const c of central) csize += c.length;
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  let total = 0;
  for (const a of all) total += a.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

/** The .xlsx bytes for this deal. `holds` are the seven hold times on the "By Hold Time" tab. */
export function buildBuydownXlsx(partsB64: Record<string, string>, o: BuydownInputs, hold: number, holds: number[]): Uint8Array {
  return makeZip(workbookFiles(partsB64, o, hold, holds));
}

/** Builds the file and hands it to the browser to save. The workbook data is only fetched when this runs. */
export async function downloadBuydownExcel(o: BuydownInputs, hold: number, holds: number[]): Promise<void> {
  const { BUYDOWN_WORKBOOK_PARTS_B64 } = await import("@/lib/buydown-workbook-parts");
  const bytes = buildBuydownXlsx(BUYDOWN_WORKBOOK_PARTS_B64, o, hold, holds);
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = BUYDOWN_EXCEL_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
