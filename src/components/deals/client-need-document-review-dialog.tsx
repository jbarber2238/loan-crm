"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Pencil, Check, X, Sparkles, Send, ArrowRightLeft } from "lucide-react";
import {
  approveClientNeedDocuments,
  rejectClientNeedDocuments,
  acceptClientNeed,
  renameClientNeedDocument,
} from "@/server/actions/client-need-documents";
import { ChangeNeedDialog, type ChangeNeedCandidate } from "@/components/deals/change-need-dialog";
import type { DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";
import {
  reviewClientNeedDocuments,
  askAboutClientNeedDocuments,
  type AiReviewFlag,
  type OperatingAgreementFacts,
} from "@/server/ai/client-need-document-review";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "cn";

export interface ReviewableDocument {
  id: string;
  fileName: string;
  mimeType: string;
  reviewStatus: "pending" | "approved" | "rejected";
  rejectionNote: string | null;
  aiReviewFlags: { flags: AiReviewFlag[] } | null;
  aiReviewedAt: Date | null;
  aiExtractedFacts: OperatingAgreementFacts | null;
}

const FACT_LABELS: Record<keyof OperatingAgreementFacts, string> = {
  entityName: "Entity Name",
  managerName: "Manager's Name",
  effectiveDate: "Effective Date",
  ownershipBreakdown: "Ownership Breakdown",
  principalOffice: "Principal Office",
  signatureType: "Signature Type",
  unanimousConsentClause: "Unanimous Consent Clause",
};

// heic/heif are included here even though the raw file isn't browser-viewable —
// /api/client-need-documents/[id] converts those to JPEG on the fly, so by
// the time it reaches this <img>, it always is one.
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const STATUS_BADGE: Record<ReviewableDocument["reviewStatus"], { label: string; variant: "success" | "destructive" | "warning" }> = {
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  pending: { label: "Review needed", variant: "warning" },
};

function DocumentThumbnail({
  doc,
  isCurrent,
  checked,
  onToggleChecked,
  onSelect,
}: {
  doc: ReviewableDocument;
  isCurrent: boolean;
  checked: boolean;
  onToggleChecked: (checked: boolean) => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "cursor-pointer space-y-0.5 rounded-md border p-1 text-center",
        isCurrent && "border-primary ring-1 ring-primary"
      )}
    >
      <div className="flex items-center justify-between">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggleChecked(v === true)}
          onClick={(e) => e.stopPropagation()}
          className="size-3.5"
        />
        <Badge variant={STATUS_BADGE[doc.reviewStatus].variant} className="px-1 py-0 text-[8px] leading-tight">
          {STATUS_BADGE[doc.reviewStatus].label}
        </Badge>
      </div>
      <button type="button" onClick={onSelect} className="flex w-full flex-col items-center gap-0.5">
        <FileText className="size-5 text-muted-foreground" />
        <span className="line-clamp-2 text-[9px] leading-tight">{doc.fileName}</span>
      </button>
    </div>
  );
}

export function ClientNeedDocumentReviewDialog({
  dealId,
  needId,
  needName,
  documents,
  allNeeds,
  catalog,
  initialDocumentId,
  open,
  onOpenChange,
}: {
  dealId: string;
  needId: string;
  needName: string;
  documents: ReviewableDocument[];
  allNeeds: ChangeNeedCandidate[];
  catalog: DealCatalogItem[];
  initialDocumentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The Reject Need confirmation popup's own note — separate from the
  // per-document rejection notes below, which each get their own inline box
  // right under the button that opened them, not a shared one.
  const [rejectNeedOpen, setRejectNeedOpen] = useState(false);
  const [rejectNeedNote, setRejectNeedNote] = useState("");
  const [disapprovingDocId, setDisapprovingDocId] = useState<string | null>(null);
  const [disapproveNote, setDisapproveNote] = useState("");
  const [disapprovingSelected, setDisapprovingSelected] = useState(false);
  const [selectedDisapproveNote, setSelectedDisapproveNote] = useState("");
  const [currentId, setCurrentId] = useState(initialDocumentId);
  const [jumpPage, setJumpPage] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [reviewPending, startReviewTransition] = useTransition();
  const [asking, startAskTransition] = useTransition();
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ question: string; answer: string | null; error?: string }[]>([]);
  const latestChatEntryRef = useRef<HTMLDivElement>(null);

  // Rejected documents are gone from this preview entirely — they only live
  // in the deal-wide Documents tab's Rejected bucket, where restoreRejectedDocuments
  // puts them back to pending under their need. Falling back within this
  // filtered list (not `documents[0]`) means rejecting the document you're
  // currently looking at automatically advances to another visible one
  // instead of continuing to show something that just dropped out of view.
  const visibleDocuments = documents.filter((d) => d.reviewStatus !== "rejected");
  const current = visibleDocuments.find((d) => d.id === currentId) ?? visibleDocuments[0];
  const fileUrl = current
    ? `/api/client-need-documents/${current.id}${jumpPage ? `#page=${jumpPage}` : ""}`
    : "";
  const isImage = current ? SUPPORTED_IMAGE_TYPES.has(current.mimeType.toLowerCase()) : false;
  // Whichever document the last AI Review actually pulled facts from — for
  // an Operating Agreement need this is normally the only document anyway.
  const factsDoc = visibleDocuments.find((d) => d.aiExtractedFacts);

  function selectDocument(id: string) {
    setCurrentId(id);
    setJumpPage(null);
  }

  function jumpToFlag(docId: string, page: number | null) {
    setCurrentId(docId);
    setJumpPage(page);
  }

  function handleRunReview() {
    setError(null);
    startReviewTransition(async () => {
      try {
        const result = await reviewClientNeedDocuments(dealId, needId);
        const flagsPart =
          result.totalFlags > 0 ? `${result.totalFlags} thing${result.totalFlags === 1 ? "" : "s"} flagged` : "nothing flagged";
        toast.success(`Reviewed — ${flagsPart}${result.factsExtracted ? ", key facts extracted" : ""}`);
        if (result.errors.length) toast.error(String(result.errors[0]));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI review failed — try again.");
      }
    });
  }

  function handleAsk() {
    const question = chatQuestion.trim();
    if (!question) return;
    setChatQuestion("");
    // Show the question (and a "Thinking…" placeholder) immediately, scrolled
    // into view right away — not after the round trip completes — so there's
    // no hunting for what you asked once the answer lands. The placeholder is
    // then updated in place rather than appended to.
    setChatHistory((prev) => [...prev, { question, answer: null }]);
    requestAnimationFrame(() => latestChatEntryRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));

    startAskTransition(async () => {
      try {
        const { answer } = await askAboutClientNeedDocuments(dealId, needId, question);
        setChatHistory((prev) => {
          const next = [...prev];
          next[next.length - 1] = { question, answer };
          return next;
        });
      } catch (err) {
        setChatHistory((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            question,
            answer: null,
            error: err instanceof Error ? err.message : "Couldn't get an answer — try again.",
          };
          return next;
        });
      }
    });
  }

  function toggleChecked(id: string, checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That didn't go through — try again.");
      }
    });
  }

  function validateNote(value: string): string | null {
    if (!value.trim()) {
      setError("A rejection note is required.");
      return null;
    }
    return value.trim();
  }

  function startRenaming(doc: ReviewableDocument) {
    setRenamingId(doc.id);
    setNameDraft(doc.fileName);
  }

  function saveRename(documentId: string) {
    const name = nameDraft.trim();
    if (!name) {
      setError("File name can't be empty.");
      return;
    }
    run(() => renameClientNeedDocument(dealId, needId, documentId, name));
    setRenamingId(null);
  }

  // Rejected ids may still linger in a stale checkedIds selection (e.g. one
  // doc in a multi-select got rejected via a different flow) — filtered out
  // here so "Approve selected"/"Reject selected" never silently act on a
  // document that's no longer visible.
  const checkedList = Array.from(checkedIds).filter((id) => visibleDocuments.some((d) => d.id === id));
  const nonRejectedIds = visibleDocuments.map((d) => d.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[95vh] w-[98vw] max-w-[calc(100%-1rem)] flex-col overflow-hidden p-3 sm:max-w-[2200px]">
          <DialogHeader>
            <DialogTitle>
              Reviewing: {needName} ({visibleDocuments.length} doc{visibleDocuments.length === 1 ? "" : "s"})
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 gap-2">
            {/* Sidebar — switch which document is shown, check to multi-select.
                Kept slim on purpose: the document itself is what needs to be
                readable, this strip is just for quick page/file switching.
                Rejected documents never appear here — once rejected, a
                document only lives in the deal-wide Documents tab's Rejected
                bucket, restorable from there. */}
            {visibleDocuments.length > 1 && (
              <div className="w-[84px] shrink-0 space-y-1.5 overflow-y-auto border-r pr-1.5">
                {visibleDocuments.map((doc) => (
                  <DocumentThumbnail
                    key={doc.id}
                    doc={doc}
                    isCurrent={doc.id === currentId}
                    checked={checkedIds.has(doc.id)}
                    onToggleChecked={(v) => toggleChecked(doc.id, v)}
                    onSelect={() => selectDocument(doc.id)}
                  />
                ))}
              </div>
            )}

            {/* Main viewer — the reason this dialog exists, so it gets almost
                all the width; the file list and AI panel are both kept slim. */}
            <div className="min-w-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
              {current ? (
                isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl} alt={current.fileName} className="h-full w-full object-contain" />
                ) : (
                  <iframe src={fileUrl} title={current.fileName} className="h-full w-full" />
                )
              ) : (
                <p className="p-4 text-sm text-muted-foreground">No documents yet.</p>
              )}
            </div>

            {/* Current-document panel — kept narrow so the viewer stays the
                star of the layout. */}
            {current && (
              <div className="w-[300px] shrink-0 space-y-3 overflow-y-auto">
                <div>
                  {renamingId === current.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(current.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="h-7 text-sm"
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => saveRename(current.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRenamingId(null)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium break-words">{current.fileName}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startRenaming(current)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Rename file"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <ChangeNeedDialog
                          dealId={dealId}
                          documentId={current.id}
                          sourceNeedId={needId}
                          needs={allNeeds}
                          catalog={catalog}
                          trigger={
                            <button type="button" className="text-muted-foreground hover:text-foreground" title="Change need">
                              <ArrowRightLeft className="size-3.5" />
                            </button>
                          }
                        />
                      </div>
                    </div>
                  )}
                  <Badge variant={STATUS_BADGE[current.reviewStatus].variant} className="mt-1">
                    {STATUS_BADGE[current.reviewStatus].label}
                  </Badge>
                </div>
                {current.rejectionNote && (
                  <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    Rejected: {current.rejectionNote}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="success"
                    disabled={pending}
                    onClick={() => run(() => approveClientNeedDocuments(dealId, needId, [current.id]))}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setDisapproveNote("");
                      setDisapprovingDocId((id) => (id === current.id ? null : current.id));
                    }}
                  >
                    Disapprove
                  </Button>
                </div>

                {disapprovingDocId === current.id && (
                  <div className="space-y-1.5 rounded-md border p-2">
                    <Textarea
                      placeholder="Reason for rejecting this document"
                      rows={2}
                      value={disapproveNote}
                      onChange={(e) => setDisapproveNote(e.target.value)}
                      autoFocus
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDisapprovingDocId(null)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => {
                          const n = validateNote(disapproveNote);
                          if (!n) return;
                          run(() => rejectClientNeedDocuments(dealId, needId, [current.id], n));
                          setDisapprovingDocId(null);
                        }}
                      >
                        Reject document
                      </Button>
                    </div>
                  </div>
                )}

                {checkedList.length > 0 && (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{checkedList.length} selected</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="success"
                        disabled={pending}
                        onClick={() => run(() => approveClientNeedDocuments(dealId, needId, checkedList))}
                      >
                        Approve selected
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setSelectedDisapproveNote("");
                          setDisapprovingSelected((v) => !v);
                        }}
                      >
                        Reject selected
                      </Button>
                    </div>
                    {disapprovingSelected && (
                      <div className="space-y-1.5">
                        <Textarea
                          placeholder="Reason for rejecting the selected documents"
                          rows={2}
                          value={selectedDisapproveNote}
                          onChange={(e) => setSelectedDisapproveNote(e.target.value)}
                          autoFocus
                        />
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDisapprovingSelected(false)}>
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => {
                              const n = validateNote(selectedDisapproveNote);
                              if (!n) return;
                              run(() => rejectClientNeedDocuments(dealId, needId, checkedList, n));
                              setDisapprovingSelected(false);
                            }}
                          >
                            Reject selected documents
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {factsDoc && (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="size-3.5" />
                      Key Facts
                    </p>
                    <dl className="space-y-1.5">
                      {(Object.keys(FACT_LABELS) as (keyof OperatingAgreementFacts)[]).map((key) => {
                        const fact = factsDoc.aiExtractedFacts![key];
                        return (
                          <div key={key} className="text-xs">
                            <dt className="text-muted-foreground">{FACT_LABELS[key]}</dt>
                            <dd className="flex items-start justify-between gap-2 font-medium">
                              <span>{fact.value ?? "Not found"}</span>
                              {fact.page && (
                                <button
                                  type="button"
                                  onClick={() => jumpToFlag(factsDoc.id, fact.page)}
                                  className="shrink-0 text-primary hover:underline"
                                >
                                  Page {fact.page}
                                </button>
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                )}

                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="size-3.5" />
                      AI Review
                    </p>
                    <Button type="button" size="sm" variant="outline" disabled={reviewPending} onClick={handleRunReview}>
                      {reviewPending
                        ? "Reviewing…"
                        : visibleDocuments.some((d) => d.aiReviewedAt)
                          ? "Re-run"
                          : "Run AI Review"}
                    </Button>
                  </div>
                  {visibleDocuments.every((d) => !d.aiReviewedAt) ? (
                    <p className="text-xs text-muted-foreground">
                      Not reviewed yet — runs AI review on all {visibleDocuments.length} document
                      {visibleDocuments.length === 1 ? "" : "s"} in this need.
                    </p>
                  ) : (
                    visibleDocuments
                      .filter((d) => d.aiReviewedAt)
                      .map((doc) => {
                        const flags = doc.aiReviewFlags?.flags ?? [];
                        return (
                          <div key={doc.id} className="space-y-1">
                            <p className="truncate text-xs font-medium">{doc.fileName}</p>
                            {flags.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No issues found.</p>
                            ) : (
                              <ul className="space-y-1">
                                {flags.map((flag, i) => (
                                  <li key={i}>
                                    <button
                                      type="button"
                                      onClick={() => jumpToFlag(doc.id, flag.page)}
                                      className="w-full rounded-md border border-amber-200 bg-amber-50 p-1.5 text-left text-xs hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
                                    >
                                      <span className="font-medium">
                                        {flag.page ? `Page ${flag.page}: ` : ""}
                                      </span>
                                      {flag.concern}
                                      {flag.quote && (
                                        <span className="mt-0.5 block italic text-muted-foreground">
                                          &ldquo;{flag.quote}&rdquo;
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>

                <div className="space-y-2 rounded-md border p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ask about these documents
                  </p>
                  {chatHistory.length > 0 && (
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {chatHistory.map((qa, i) => (
                        <div
                          key={i}
                          ref={i === chatHistory.length - 1 ? latestChatEntryRef : undefined}
                          className="scroll-mt-1 space-y-0.5 text-xs"
                        >
                          <p className="font-medium">{qa.question}</p>
                          {qa.answer !== null ? (
                            <p className="whitespace-pre-wrap text-muted-foreground">{qa.answer}</p>
                          ) : qa.error ? (
                            <p className="text-destructive">{qa.error}</p>
                          ) : (
                            <p className="italic text-muted-foreground">Thinking…</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <Input
                      placeholder="e.g. Do these show $20k minimum liquidity?"
                      value={chatQuestion}
                      onChange={(e) => setChatQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAsk();
                        }
                      }}
                      className="h-8 text-xs"
                      disabled={asking}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      disabled={asking || !chatQuestion.trim()}
                      onClick={handleAsk}
                    >
                      <Send className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-t pt-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="success"
                  disabled={pending || nonRejectedIds.length === 0}
                  onClick={() => run(() => acceptClientNeed(dealId, needId))}
                >
                  Accept Need
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending || nonRejectedIds.length === 0}
                  onClick={() => {
                    setError(null);
                    setRejectNeedNote("");
                    setRejectNeedOpen(true);
                  }}
                >
                  Reject Need
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectNeedOpen} onOpenChange={setRejectNeedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject &ldquo;{needName}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This rejects every document in the need with this one shared reason — the borrower will see it as the
            whole need being sent back, not just one file.
          </p>
          <Textarea
            placeholder="Reason for rejecting this client need"
            rows={3}
            value={rejectNeedNote}
            onChange={(e) => setRejectNeedNote(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejectNeedOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const n = validateNote(rejectNeedNote);
                if (!n) return;
                run(() => rejectClientNeedDocuments(dealId, needId, nonRejectedIds, n));
                setRejectNeedOpen(false);
              }}
            >
              Reject Need
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
