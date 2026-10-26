"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileText, Pencil, Trash2, Upload, X } from "lucide-react";
import { deleteDealFile, updateDealFileNote, uploadDealFile } from "@/server/actions/deal-files";
import { isActionError } from "@/lib/action-result";
import { DEAL_FILE_NOTE_MAX, type DealFileRow } from "@/lib/deal-files";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { stageLargeFiles } from "@/lib/stage-large-files";
import { stageUploadChunk } from "@/server/actions/staged-upload";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatStamp(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Choose a file, add an optional note, save. Every save is a new entry, never a replacement. */
export function DealFileUploadForm({
  dealId,
  category,
  notePlaceholder,
  onDone,
}: {
  dealId: string;
  category: "insurance" | "title" | "other";
  notePlaceholder?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        start(async () => {
          try {
            const result = await uploadDealFile(dealId, category, await stageLargeFiles(formData, stageUploadChunk));
            if (isActionError(result)) {
              toast.error(result.error);
              return;
            }
            toast.success("Document saved");
            formRef.current?.reset();
            setFileName("");
            router.refresh();
            onDone?.();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't save this document.");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`file-${category}`}>File</Label>
        <input
          id={`file-${category}`}
          name="file"
          type="file"
          required
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-muted"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`note-${category}`}>Note (optional)</Label>
        <Textarea
          id={`note-${category}`}
          name="note"
          rows={3}
          maxLength={DEAL_FILE_NOTE_MAX}
          placeholder={notePlaceholder ?? "What changed in this version, or why it matters…"}
        />
      </div>
      <Button type="submit" disabled={pending || !fileName} className="w-full">
        <Upload className="size-3.5" />
        {pending ? "Saving…" : "Save document"}
      </Button>
    </form>
  );
}

/** One saved file: its name (opens it), who and when, its note (editable), and delete. */
export function DealFileEntry({ dealId, file, version }: { dealId: string; file: DealFileRow; version?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.note ?? "");
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run(fn: () => Promise<unknown>, success: string, after?: () => void) {
    start(async () => {
      try {
        const result = await fn();
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        after?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-1.5 rounded-md border px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a href={`/api/deal-files/${file.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium hover:underline">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.fileName}</span>
            {version && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{version}</span>}
          </a>
          <p className="text-xs text-muted-foreground">
            {formatStamp(file.createdAt)}
            {file.uploadedByName ? ` · ${file.uploadedByName}` : ""} · {formatBytes(file.fileSize)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" size="icon-sm" variant="ghost" title="Edit note" onClick={() => setEditing((v) => !v)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title="Delete"
            disabled={pending}
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <ConfirmDialog
            open={confirmDelete}
            title="Delete this document?"
            message={`"${file.fileName}" will be removed from this deal. This can't be undone.`}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              setConfirmDelete(false);
              run(() => deleteDealFile(dealId, file.id), "Document deleted");
            }}
          />
        </div>
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <Textarea rows={3} value={draft} maxLength={DEAL_FILE_NOTE_MAX} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="flex gap-1">
            <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateDealFileNote(dealId, file.id, draft), "Note saved", () => setEditing(false))}>
              <Check className="size-3.5" />
              Save note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(file.note ?? "");
                setEditing(false);
              }}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      ) : file.note ? (
        <p className="whitespace-pre-wrap rounded bg-muted/50 px-2 py-1.5 text-xs">{file.note}</p>
      ) : (
        <p className="text-xs text-muted-foreground">No note.</p>
      )}
    </div>
  );
}
