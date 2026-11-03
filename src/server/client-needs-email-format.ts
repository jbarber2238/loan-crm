import {
  escapeHtml,
  htmlBulletList,
  EMAIL_LIST_STYLE,
  EMAIL_ITEM_STYLE,
  EMAIL_SUBNOTE_STYLE,
  EMAIL_SECTION_HEADING_STYLE,
} from "@/lib/email-html";

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
        const notes = n.documents
          .map(
            (d) =>
              `<br/><span style="${EMAIL_SUBNOTE_STYLE}">${n.hideFileNames ? "" : `${escapeHtml(d.fileName)}: `}${escapeHtml(
                d.rejectionNote ?? "No reason given"
              )}</span>`
          )
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
