// Parsing for the full client-need form when it's saved onto a single deal (the "Edit client need" dialog for a custom
// need). The catalog's own create/update actions keep private copies of the same small readers; this is a plain module,
// not a "use server" file, so nothing here is callable from the browser.

export const MAX_NEED_TEMPLATE_FILE_SIZE = 15 * 1024 * 1024; // 15MB, same cap as the catalog form

export type DealNeedType = "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form" | "custom_form";

const NEED_TYPES: readonly DealNeedType[] = ["document_upload", "esign", "questionnaire", "link", "pandadoc_form", "custom_form"];

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formNullable(formData: FormData, key: string): string | null {
  const value = formString(formData, key);
  return value.length ? value : null;
}

export function dealNeedTypeFrom(formData: FormData): DealNeedType {
  const value = formString(formData, "needType");
  return (NEED_TYPES as readonly string[]).includes(value) ? (value as DealNeedType) : "document_upload";
}

export interface FormQuestion {
  /** Id of the existing answer row this question came from; empty for a brand-new question. */
  id: string | null;
  questionText: string;
  required: boolean;
}

// questionText / questionRequired / questionId are rendered together per row, so they line up by index. Blank
// questions are dropped along with their flag and id.
export function formQuestionsFrom(formData: FormData): FormQuestion[] {
  const texts = formData.getAll("questionText");
  const flags = formData.getAll("questionRequired");
  const ids = formData.getAll("questionId");
  return texts
    .map((v, i) => ({
      id: typeof ids[i] === "string" && ids[i] ? (ids[i] as string) : null,
      questionText: typeof v === "string" ? v.trim() : "",
      required: flags[i] === "1",
    }))
    .filter((q) => q.questionText.length > 0);
}

export type TemplateFileFields =
  | { templateFileName: string; templateFileMimeType: string; templateFileData: string; templateFileSize: number }
  | { templateFileName: null; templateFileMimeType: null; templateFileData: null; templateFileSize: null }
  | Record<string, never>;

/** A new file replaces the old one, "removeTemplateFile" clears it, otherwise the current file is left alone. */
export async function formTemplateFileFields(formData: FormData): Promise<TemplateFileFields> {
  const file = formData.get("templateFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_NEED_TEMPLATE_FILE_SIZE) throw new Error(`${file.name} is too large (15MB max)`);
    return {
      templateFileName: file.name,
      templateFileMimeType: file.type || "application/octet-stream",
      templateFileData: Buffer.from(await file.arrayBuffer()).toString("base64"),
      templateFileSize: file.size,
    };
  }
  if (formString(formData, "removeTemplateFile") === "on") {
    return { templateFileName: null, templateFileMimeType: null, templateFileData: null, templateFileSize: null };
  }
  return {};
}
