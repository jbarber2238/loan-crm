// Spreadsheets can't be shown by a browser's built-in viewer (it just downloads them), so the review window
// shows them as plain tables built on our side instead. This file decides what counts as a spreadsheet.

const SPREADSHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
  "application/csv",
]);

const SPREADSHEET_EXTENSION = /\.(?:xlsx|xlsm|xls|ods|csv)$/i;

/** True for Excel, OpenDocument and CSV files, judged by file type and, when that's generic, by the name. */
export function isSpreadsheet(mimeType: string, fileName: string): boolean {
  return SPREADSHEET_TYPES.has(mimeType.toLowerCase().split(";")[0].trim()) || SPREADSHEET_EXTENSION.test(fileName);
}

/** The address that shows a document in a window: the file itself, or a table view for spreadsheets. */
export function documentViewUrl(doc: { id: string; mimeType: string; fileName: string }): string {
  return isSpreadsheet(doc.mimeType, doc.fileName) ? `/api/client-need-documents/${doc.id}/preview` : `/api/client-need-documents/${doc.id}`;
}
