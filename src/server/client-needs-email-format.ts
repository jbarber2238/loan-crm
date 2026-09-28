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
  rejectedNeeds: { itemName: string; documents: { fileName: string; rejectionNote: string | null }[] }[],
  outstandingNeeds: { itemName: string; description: string | null }[]
): string {
  const sections: string[] = [];
  if (rejectedNeeds.length > 0) {
    const list = rejectedNeeds
      .map((n) => {
        const notes = n.documents
          .map(
            (d) =>
              `<br/><span style="${EMAIL_SUBNOTE_STYLE}">${escapeHtml(d.fileName)}: ${escapeHtml(
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