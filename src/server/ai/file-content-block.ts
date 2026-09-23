import type Anthropic from "@anthropic-ai/sdk";
import { detectImageMediaType } from "@/server/ai/image-media-type";

export const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

/** Turns an uploaded file into the content block Claude's Messages API accepts — a PDF as a document block, a supported image type as an image block, null for anything else. Shared by every AI-extraction flow that reads an uploaded file (lender replies, appraisal reports). */
export function fileToContentBlock(file: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Anthropic.ContentBlockParam | null {
  const mime = file.mimeType.toLowerCase();
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.dataBase64 } };
  }
  if (SUPPORTED_IMAGE_TYPES.has(mime)) {
    return {
      type: "image",
      source: { type: "base64", media_type: detectImageMediaType(file.dataBase64, mime), data: file.dataBase64 },
    };
  }
  return null;
}
