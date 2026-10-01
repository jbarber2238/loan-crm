// Server-side wrapper around the shared Excel-workbook builder, for emailing
// the file as an attachment (the browser download at
// src/lib/max-offer-excel-export.ts's downloadMaxOfferExcel handles the
// in-browser "Download as Excel" click — this is the other caller of the
// same pure buildMaxOfferWorkbookBuffer). Reads the logo from the local
// public/ folder directly rather than fetching a relative URL, since
// there's no browser `fetch` origin to resolve one against on the server.

import { readFile } from "fs/promises";
import path from "path";
import { buildMaxOfferWorkbookBuffer, MAX_OFFER_EXCEL_FILE_NAME, type MaxOfferExcelInputs } from "@/lib/max-offer-excel-export";
import type { GmailAttachment } from "@/server/gmail/send";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function generateMaxOfferExcelAttachment(inputs: MaxOfferExcelInputs): Promise<GmailAttachment> {
  const logoPath = path.join(process.cwd(), "public", "brand", "manna-lending-onecolor-white-transparent.png");
  const logoBuffer = await readFile(logoPath).catch(() => null);

  const buffer = await buildMaxOfferWorkbookBuffer(inputs, logoBuffer ? logoBuffer.buffer.slice(logoBuffer.byteOffset, logoBuffer.byteOffset + logoBuffer.byteLength) : null);

  return {
    fileName: MAX_OFFER_EXCEL_FILE_NAME(),
    mimeType: XLSX_MIME_TYPE,
    data: Buffer.from(buffer).toString("base64"),
  };
}
