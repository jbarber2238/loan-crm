"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  previewApplicationSubmissionEmail,
  sendApplicationSubmissionEmail,
  type AttachableDocument,
} from "@/server/actions/application-submission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RecipientLine } from "@/components/emails/recipient-line";
import { SignaturePreview } from "@/components/emails/signature-preview";
import { HtmlBodyEditor } from "@/components/emails/html-body-editor";
import { formatFileSize } from "@/lib/format";
import { MAX_ATTACHMENT_BYTES, formatMb } from "@/lib/attachment-limits";
import type { RecipientCandidate } from "@/lib/email-recipients";

function AttachmentsChecklist({
  documents,
  selectedIds,
  onToggle,
}: {
  documents: AttachableDocument[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (documents.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No approved client-need documents on this deal yet — nothing to attach.
      </p>
    );
  }

  return (
    <div className="space-y-1 rounded-md border p-2">
      {documents.map((doc) => (
        <label key={doc.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50">
          <Checkbox
            checked={selectedIds.has(doc.id)}
            onCheckedChange={(v) => onToggle(doc.id, v === true)}
          />
          <span className="flex-1 truncate">{doc.fileName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{doc.needName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
        </label>
      ))}
    </div>
  );
}

function SubmitApplicationEmailDialog({ dealId }: { dealId: string }) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [candidates, setCandidates] = useState<RecipientCandidate[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<AttachableDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setLoading(true);
    previewApplicationSubmissionEmail(dealId)
      .then((preview) => {
        setTo(preview.to);
        setCc(preview.cc);
        setSubject(preview.subject);
        setBody(preview.body);
        setSignatureHtml(preview.signatureHtml);
        setCandidates(preview.candidates);
        setAvailableDocuments(preview.availableDocuments);
        setSelectedDocumentIds(new Set(preview.selectedDocumentIds));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't build this email."))
      .finally(() => setLoading(false));
  }

  function toggleDocument(id: string, checked: boolean) {
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectedBytes = availableDocuments
    .filter((d) => selectedDocumentIds.has(d.id))
    .reduce((sum, d) => sum + d.fileSize, 0);
  const overSizeLimit = selectedBytes > MAX_ATTACHMENT_BYTES;

  function handleSend() {
    if (overSizeLimit) return;
    setError(null);
    const finalBody = bodyRef.current?.innerHTML ?? body;
    startSend(async () => {
      try {
        await sendApplicationSubmissionEmail(dealId, to, cc, subject, finalBody, Array.from(selectedDocumentIds));
        setOpen(false);
        toast.success("Application submitted");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send this email.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Submit Application</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Submit application</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error && !subject ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <RecipientLine id="submit-app-to" label="To" value={to} onChange={setTo} candidates={candidates} />
              <RecipientLine id="submit-app-cc" label="Cc" value={cc} onChange={setCc} candidates={candidates} />
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div className="space-y-1.5">
              <Label>Email preview — click any text below to edit it</Label>
              <HtmlBodyEditor html={body} bodyRef={bodyRef} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  Attach approved documents ({selectedDocumentIds.size}/{availableDocuments.length})
                </Label>
                {selectedBytes > 0 && (
                  <span className={`text-xs ${overSizeLimit ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                    {formatMb(selectedBytes)} selected
                  </span>
                )}
              </div>
              <AttachmentsChecklist
                documents={availableDocuments}
                selectedIds={selectedDocumentIds}
                onToggle={toggleDocument}
              />
              {overSizeLimit && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  These attachments total {formatMb(selectedBytes)}, over the ~{formatMb(MAX_ATTACHMENT_BYTES)} most
                  email providers (including Gmail) will actually deliver. Sending anyway risks a bounce with no
                  warning that the lender never got it — uncheck some documents, or send the rest in a follow-up
                  email.
                </p>
              )}
            </div>
            <SignaturePreview html={signatureHtml} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="w-full" disabled={sending || overSizeLimit} onClick={handleSend}>
              {sending ? "Sending…" : overSizeLimit ? "Attachments too large to send" : "Send"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SubmitApplicationButton({
  dealId,
  method,
  portalUrl,
}: {
  dealId: string;
  method: "portal" | "email" | null;
  portalUrl: string | null;
}) {
  if (method === "portal" && portalUrl) {
    return (
      <Button asChild size="sm">
        <a href={portalUrl} target="_blank" rel="noreferrer">
          Submit Application
        </a>
      </Button>
    );
  }

  return <SubmitApplicationEmailDialog dealId={dealId} />;
}
