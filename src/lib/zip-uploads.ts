// Borrowers often send a folder of photos or statements as one .zip. A zip can't be reviewed (the
// viewer can't open it) and a big one blows past the per-file limit, so the browser opens it before
// anything is sent: every file inside becomes its own upload, and the existing chunked staging
// (stage-large-files.ts) carries each one. Nothing about the zip itself ever reaches the server.

/** Same per-file cap the upload actions enforce. */
export const MAX_UPLOAD_FILE_BYTES = 15 * 1024 * 1024;
/** A zip this big can't be opened safely in a browser tab. */
const MAX_ZIP_BYTES = 400 * 1024 * 1024;
/** Everything inside one pick, added together. */
const MAX_TOTAL_EXTRACTED_BYTES = 500 * 1024 * 1024;
const MAX_EXTRACTED_FILES = 500;
/** How many zips may sit inside zips. */
const MAX_ZIP_DEPTH = 3;
/** Files sent per server call, so no single request has to do all of a big zip's work. */
export const UPLOAD_BATCH_SIZE = 8;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

const JUNK_NAMES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

export function isZipFile(file: File): boolean {
  return /\.zip$/i.test(file.name) || /^application\/(x-)?zip(-compressed)?$/i.test(file.type);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Folders, macOS resource forks and hidden files that ride along in a zip but aren't documents. */
function isJunkPath(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return true;
  if (parts.some((p) => p === "__MACOSX" || p.startsWith("."))) return true;
  return JUNK_NAMES.has(parts[parts.length - 1].toLowerCase());
}

export interface ExpandedUpload {
  files: File[];
  /** Plain-language reasons some files didn't make it ("IMG_1.jpg in 09.05.26.zip is over 15MB"). */
  skipped: string[];
  /** How many of the picked files were zips that got opened. */
  zipsOpened: number;
}

/**
 * Replaces each zip in `picked` with the files inside it. Files that aren't zips pass through
 * untouched. Files from a zip are named "<zip name> - <path in the zip>.ext" so the zip's own label
 * (often a date, like "09.05.26") stays attached to each photo.
 */
export async function expandZipFiles(picked: File[]): Promise<ExpandedUpload> {
  const result: ExpandedUpload = { files: [], skipped: [], zipsOpened: 0 };
  const budget = { bytes: 0 };
  for (const file of picked) {
    if (!isZipFile(file)) {
      result.files.push(file);
      continue;
    }
    await expandOne(file, 1, result, budget);
  }
  return result;
}

async function expandOne(zip: File, depth: number, out: ExpandedUpload, budget: { bytes: number }): Promise<void> {
  if (depth > MAX_ZIP_DEPTH) {
    out.skipped.push(`${zip.name} is zipped too many levels deep to open`);
    return;
  }
  if (zip.size > MAX_ZIP_BYTES) {
    out.skipped.push(`${zip.name} is too large to open (400MB max). Please split it into smaller zips.`);
    return;
  }

  const { default: JSZip } = await import("jszip");
  let archive: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    archive = await JSZip.loadAsync(zip);
  } catch {
    out.skipped.push(`${zip.name} couldn't be opened. It may be damaged or password-protected.`);
    return;
  }
  out.zipsOpened += 1;

  const label = zip.name.replace(/\.zip$/i, "");
  for (const entry of Object.values(archive.files)) {
    if (entry.dir || isJunkPath(entry.name)) continue;
    if (out.files.length >= MAX_EXTRACTED_FILES) {
      out.skipped.push(`Stopped at ${MAX_EXTRACTED_FILES} files; ${zip.name} has more. Please upload the rest separately.`);
      return;
    }

    const shortName = entry.name.split("/").filter(Boolean).join(" - ");
    const fileName = `${label} - ${shortName}`;
    let blob: Blob;
    try {
      blob = await entry.async("blob");
    } catch {
      out.skipped.push(`${shortName} in ${zip.name} couldn't be read (it may be password-protected)`);
      continue;
    }
    if (blob.size === 0) continue;

    budget.bytes += blob.size;
    if (budget.bytes > MAX_TOTAL_EXTRACTED_BYTES) {
      out.skipped.push(`Stopped opening ${zip.name}: the files inside add up to more than 500MB. Please upload in smaller groups.`);
      return;
    }

    const ext = extensionOf(entry.name);
    const extracted = new File([blob], fileName, { type: MIME_BY_EXTENSION[ext] ?? "application/octet-stream" });
    if (ext === "zip") {
      await expandOne(extracted, depth + 1, out, budget);
      continue;
    }
    if (blob.size > MAX_UPLOAD_FILE_BYTES) {
      out.skipped.push(`${shortName} in ${zip.name} is over 15MB`);
      continue;
    }
    out.files.push(extracted);
  }
}

/** Splits a list into groups small enough that each server call stays quick. */
export function batchFiles(files: File[], size = UPLOAD_BATCH_SIZE): File[][] {
  const batches: File[][] = [];
  for (let i = 0; i < files.length; i += size) batches.push(files.slice(i, i + size));
  return batches;
}

/** One-line summary for the person who uploaded: what happened to the files they picked. */
export function describeSkipped(skipped: string[]): string {
  if (skipped.length === 0) return "";
  const shown = skipped.slice(0, 3).join("; ");
  const more = skipped.length > 3 ? `; and ${skipped.length - 3} more` : "";
  return `Not uploaded: ${shown}${more}`.replace(/\.?$/, ".");
}
