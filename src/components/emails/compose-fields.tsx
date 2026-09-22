"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecipientLine } from "@/components/emails/recipient-line";
import { SignaturePreview } from "@/components/emails/signature-preview";
import { HtmlBodyEditor } from "@/components/emails/html-body-editor";
import type { RecipientCandidate } from "@/lib/email-recipients";

export interface EmailComposeState {
  to: string;
  cc: string;
  subject: string;
  body: string;
  signatureHtml: string;
  candidates: RecipientCandidate[];
}

// Shared compose view for every borrower/lender email flow that previews
// before sending — To/Cc/Subject/Body, all editable, plus the sending
// user's real signature shown before the Send click, matching every other
// email dialog in the app. The body is edited in place via HtmlBodyEditor;
// the caller reads bodyRef.current.innerHTML at send time rather than
// tracking it through compose state.
export function ComposeFields({
  idPrefix,
  compose,
  setCompose,
  bodyRef,
}: {
  idPrefix: string;
  compose: EmailComposeState;
  setCompose: Dispatch<SetStateAction<EmailComposeState | null>>;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <RecipientLine
          id={`${idPrefix}-to`}
          label="To"
          value={compose.to}
          onChange={(v) => setCompose((p) => (p ? { ...p, to: v } : p))}
          candidates={compose.candidates}
        />
        <RecipientLine
          id={`${idPrefix}-cc`}
          label="Cc"
          value={compose.cc}
          onChange={(v) => setCompose((p) => (p ? { ...p, cc: v } : p))}
          candidates={compose.candidates}
        />
      </div>
      <Input
        value={compose.subject}
        onChange={(e) => setCompose((p) => (p ? { ...p, subject: e.target.value } : p))}
      />
      <div className="space-y-1.5">
        <Label>Email preview — click any text below to edit it</Label>
        <HtmlBodyEditor html={compose.body} bodyRef={bodyRef} />
      </div>
      <SignaturePreview html={compose.signatureHtml} />
    </div>
  );
}
