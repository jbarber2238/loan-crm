"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Pencil, Check, X, Sparkles, Send } from "lucide-react";
import {
  approveClientNeedDocuments,
  rejectClientNeedDocuments,
  renameClientNeedDocument,
} from "@/server/actions/client-need-documents";
import {
  reviewClientNeedDocuments,
  askAboutClientNeedDocuments,
  type AiReviewFlag,
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
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

const STATUS_BADGE: Record<ReviewableDocument["reviewStatus"], { label: string; variant: "success" | "destructive" | "warning" }> = {
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  pending: { label: "Review needed", variant: "warning" },
};

export function ClientNeedDocumentReviewDialog({
  dealId,
  needId,
  needName,
  documents,
  initialDocumentId,
  open,
  onOpenChange,
}: {
  dealId: string;
  needId: string;
  needName: string;
  documents: ReviewableDocument[];
  initialDocumentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
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

  const current = documents.find((d) => d.id === currentId) ?? documents[0];
  const fileUrl = current
    ? `/api/client-need-documents/${current.id}${jumpPage ? `#page=${jumpPage}` : ""}`
    : "";
  const isImage = current ? SUPPORTED_IMAGE_TYPES.has(current.mimeType.toLowerCase()) : false;

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
        toast.success(
          result.totalFlags > 0
            ? `Reviewed — ${result.totalFlags} thing${result.totalFlags === 1 ? "" : "s"} flagged`
            : "Reviewed — nothing flagged"
        );
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

  function requireNote(): string | null {
    if (!note.trim()) {
      setError("A rejection note is required.");
      return null;
    }
    return note.trim();
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

  const checkedList = Array.from(checkedIds);
  const pendingIds = documents.filter((d) => d.reviewStatus === "pending").map((d) => d.id);
  const nonRejectedIds = documents.filter((d) => d.reviewStatus !== "rejected").map((d) => d.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-[1700px]">
        <DialogHeader>
          <DialogTitle>
            Reviewing: {needName} ({documents.length} doc{documents.length === 1 ? "" : "s"})
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Sidebar — switch which document is shown, check to multi-select */}
          <div className="w-40 shrink-0 space-y-2 overflow-y-auto border-r pr-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "cursor-pointer space-y-1 rounded-md border p-1.5 text-center",
                  doc.id === currentId && "border-primary ring-1 ring-primary"
                )}
              >
                <div className="flex items-center justify-between">
                  <Checkbox
                    checked={checkedIds.has(doc.id)}
                    onCheckedChange={(v) => toggleChecked(doc.id, v === true)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Badge variant={STATUS_BADGE[doc.reviewStatus].variant} className="text-[9px]">
                    {STATUS_BADGE[doc.reviewStatus].label}
                  </Badge>
                </div>
                <button type="button" onClick={() => selectDocument(doc.id)} className="flex w-full flex-col items-center gap-1">
                  <FileText className="size-8 text-muted-foreground" />
                  <span className="line-clamp-2 text-[11px] leading-tight">{doc.fileName}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Main viewer */}
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

          {/* Current-document panel */}
          {current && (
            <div className="w-[420px] shrink-0 space-y-3 overflow-y-auto">
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
                    <button
                      type="button"
                      onClick={() => startRenaming(current)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title="Rename file"
                    >
                      <Pencil className="size-3.5" />
                    </button>
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
                    const n = requireNote();
                    if (n) run(() => rejectClientNeedDocuments(dealId, needId, [current.id], n));
                  }}
                >
                  Disapprove
                </Button>
              </div>

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
                        const n = requireNote();
                        if (n) run(() => rejectClientNeedDocuments(dealId, needId, checkedList, n));
                      }}
                    >
                      Reject selected
                    </Button>
                  </div>
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
                      : documents.some((d) => d.aiReviewedAt)
                        ? "Re-run"
                        : "Run AI Review"}
                  </Button>
                </div>
                {documents.every((d) => !d.aiReviewedAt) ? (
                  <p className="text-xs text-muted-foreground">
                    Not reviewed yet — runs AI review on all {documents.length} document
                    {documents.length === 1 ? "" : "s"} in this need.
                  </p>
                ) : (
                  documents
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
          <Textarea
            placeholder="Rejection note (required to disapprove/reject)"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="success"
                disabled={pending || pendingIds.length === 0}
                onClick={() => run(() => approveClientNeedDocuments(dealId, needId, pendingIds))}
              >
                Accept Need
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || nonRejectedIds.length === 0}
                onClick={() => {
                  const n = requireNote();
                  if (n) run(() => rejectClientNeedDocuments(dealId, needId, nonRejectedIds, n));
                }}
              >
                Reject Need
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
