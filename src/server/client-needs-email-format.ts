import {
  escapeHtml,
  htmlBulletList,
  EMAIL_LIST_STYLE,
  EMAIL_ITEM_STYLE,
  EMAIL_SUBNOTE_STYLE,
  EMAIL_SECTION_HEADING_STYLE,
} from "@/lib/email-html";

// The processor's reason is the thing the borrower has to act on, so it is set apart in bold red on a tinted
// block (inline styles only: email clients ignore stylesheets), with the file name small and grey above it.
const REJECTION_REASON_BOX_STYLE = "margin:8px 0 0; padding:8px 12px; border-left:4px solid #b91c1c; background:#fef2f2;";
const REJECTION_REASON_TEXT_STYLE = "color:#991b1b; font-size:15px; font-weight:700; line-height:1.4;";

/**
 * Rejected files that share the same reason are listed together, so "Reject Need" (one note for every file on the
 * need) reads as the reason once, not once per file. Files with their own reasons stay on their own lines, in order.
 */
export function groupRejectionsByNote(
  documents: { fileName: string; rejectionNote: string | null }[]
): { fileNames: string[]; note: string | null }[] {
  const groups: { fileNames: string[]; note: string | null }[] = [];
  for (const d of documents) {
    const note = d.rejectionNote?.trim() || null;
    const existing = groups.find((g) => g.note === note);
    if (existing) existing.fileNames.push(d.fileName);
    else groups.push({ fileNames: [d.fileName], note });
  }
  return groups;
}

// One combined status block: rejected items (with the processor's note) come
// first since they need action soonest, then everything else still owed —
// this is the one email format used for both a brand-new send (nothing
// rejected yet, just the outstanding section) and a follow-up after a
// rejection, rather than two separate email types. Rendered as HTML so it
// reads like a real formatted email, not a plain-text dump.
export function formatStatusList(
  rejectedNeeds: {
    itemName: string;
    // A PandaDoc form is one document, so its file name only adds clutter in front of the reason.
    hideFileNames?: boolean;
    documents: { fileName: string; rejectionNote: string | null }[];
  }[],
  outstandingNeeds: { itemName: string; description: string | null }[]
): string {
  const sections: string[] = [];
  if (rejectedNeeds.length > 0) {
    const list = rejectedNeeds
      .map((n) => {
        const notes = groupRejectionsByNote(n.documents)
          .map((g) => {
            const files = n.hideFileNames
              ? ""
              : `<div style="${EMAIL_SUBNOTE_STYLE} margin:0 0 3px;">${g.fileNames.map(escapeHtml).join(", ")}</div>`;
            return `<div style="${REJECTION_REASON_BOX_STYLE}">${files}<div style="${REJECTION_REASON_TEXT_STYLE}">Reason: ${escapeHtml(
              g.note ?? "No reason given"
            )}</div></div>`;
          })
          .join("");
        return `<li style="${EMAIL_ITEM_STYLE}"><strong>${escapeHtml(n.itemName)}</strong> — needs to be resubmitted${notes}</li>`;
      })
      .join("");
    sections.push(
      `<div style="margin:0 0 20px;"><p style="${EMAIL_SECTION_HEADING_STYLE} color:#b91c1c;">These were not accepted and need to be resubmitted:</p><ul style="${EMAIL_LIST_STYLE}">${list}</ul></div>`
    );
  }
  if (outstandingNeeds.length > 0) {
    sections.push(
      `<div><p style="${EMAIL_SECTION_HEADING_STYLE}">Still needed:</p>${htmlBulletList(
        outstandingNeeds.map((n) => ({ name: n.itemName, note: n.description }))
      )}</div>`
    );
  }
  return sections.join("");
} 

/**
 * The rejected copies worth telling the borrower about. A PandaDoc form is one document the borrower redoes, and a
 * reopen leaves the earlier rejected copy behind, so only the newest copy counts: it is mentioned only while it is
 * itself rejected, never alongside older rejections or once a newer copy is pending or approved. Every other need
 * type lists each rejected file with its own reason.
 */
export function rejectedDocumentsToMention<D extends { reviewStatus: string; createdAt: Date }>(
  need: { needType: string; documents: D[] }
): D[] {
  if (need.needType !== "pandadoc_form") return need.documents.filter((d) => d.reviewStatus === "rejected");
  const newest = [...need.documents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return newest?.reviewStatus === "rejected" ? [newest] : [];
}
