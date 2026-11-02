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
