"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Download, EyeOff, FileText, Undo2, Pencil, Check, X, ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  restoreRejectedDocuments,
  renameClientNeedDocument,
  markClientNeedDocumentUnused,
  restoreUnusedDocuments,
  deleteClientNeedDocument,
} from "@/server/actions/client-need-documents";
import { restoreClientNeeds } from "@/server/actions/client-needs";
import type { DealDocumentRow } from "@/server/actions/client-need-documents";
import { ChangeNeedDialog, type ChangeNeedCandidate } from "@/components/deals/change-need-dialog";
import { DealFileEntry, DealFileUploadForm, formatStamp } from "@/components/deals/deal-file-parts";
import { downloadZip } from "@/lib/download-zip";
import { formatUploadedAt } from "@/lib/format-upload-time";
import { DEAL_FILE_CATEGORY_LABELS, type DealFileRow } from "@/lib/deal-files";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";

const DELETE_WORD = "delete";

/** Permanent delete of one uploaded document. The button stays off until "delete" is typed. */
function DeleteDocumentDialog({ dealId, row, onClose }: { dealId: string; row: DealDocumentRow; onClose: () => void }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toLowerCase() === DELETE_WORD;

  function confirm() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteClientNeedDocument(dealId, row.clientNeedId, row.id);
        toast.success("Document deleted");
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete this document");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this document?</DialogTitle>
          <DialogDescription>
            This permanently removes the file from the deal. It can&apos;t be undone. If it just doesn&apos;t belong in this need, use Mark unused or Change need instead.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-sm">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="break-words font-medium">{row.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {row.cameFrom ?? row.itemName} · uploaded {formatUploadedAt(row.createdAt)}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="delete-doc-confirm" className="text-sm">
            Type <span className="font-mono font-semibold">{DELETE_WORD}</span> to confirm
          </label>
          <Input
            id="delete-doc-confirm"
            autoFocus
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
            }}
          />
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!ready || pending} onClick={confirm}>
            <Trash2 className="size-3.5" />
            {pending ? "Deleting…" : "Delete document"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentSection({
  dealId,
  title,
  rows,
  propertyLabel,
  showReason,
  restore,
  canMarkUnused = false,
  needs,
  catalog,
}: {
  dealId: string;
  title: string;
  rows: DealDocumentRow[];
  propertyLabel: string;
  showReason: boolean;
  // "documents": put selected rejected documents back under review.
  // "needs": put the client needs the selected documents belong to back on the list.
  restore: "documents" | "needs" | null;
  // Offers "Mark unused" per document (only where the document is still in use).
  canMarkUnused?: boolean;
  needs: ChangeNeedCandidate[];
  catalog: DealCatalogItem[];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<DealDocumentRow | null>(null);
  const [unusedPending, startUnused] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [restoring, startRestore] = useTransition();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [renamePending, startRenameTransition] = useTransition();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function startRenaming(row: DealDocumentRow) {
    setRenamingId(row.id);
    setNameDraft(row.fileName);
  }

  function saveRename(row: DealDocumentRow) {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    startRenameTransition(async () => {
      try {
        await renameClientNeedDocument(dealId, row.clientNeedId, row.id, trimmed);
        setRenamingId(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't rename this document");
      }
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleDownload(ids: string[], label: string) {
    if (!ids.length) return;
    setDownloading(true);
    try {
      await downloadZip(ids, `${propertyLabel} - ${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download these documents");
    } finally {
      setDownloading(false);
    }
  }

  function markUnused(row: DealDocumentRow) {
    startUnused(async () => {
      try {
        await markClientNeedDocumentUnused(dealId, row.id);
        toast.success("Marked unused. It's under Unused below; the client need and the borrower weren't touched.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't mark this document unused");
      }
    });
  }

  function handleRestore() {
    const ids = [...selected];
    if (!ids.length) return;
    startRestore(async () => {
      try {
        if (restore === "needs") {
          const chosen = rows.filter((r) => selected.has(r.id));
          // One document marked unused goes back on its own need; a whole need marked unused comes back as that need.
          const docIds = chosen.filter((r) => r.unusedFromNeedId).map((r) => r.id);
          const needIds = [...new Set(chosen.filter((r) => !r.unusedFromNeedId).map((r) => r.clientNeedId))];
          const messages: string[] = [];
          if (docIds.length) {
            const { restored, skipped } = await restoreUnusedDocuments(dealId, docIds);
            if (restored) messages.push(`Put ${restored} document${restored === 1 ? "" : "s"} back on ${restored === 1 ? "its" : "their"} client need`);
            if (skipped) toast.error(`${skipped} document${skipped === 1 ? "" : "s"} couldn't go back because the original need was removed. Use Change need to file ${skipped === 1 ? "it" : "them"}.`);
          }
          if (needIds.length) {
            const count = await restoreClientNeeds(dealId, needIds);
            messages.push(`Restored ${count} client need${count === 1 ? "" : "s"} to the Client Needs list`);
          }
          if (messages.length) toast.success(messages.join(". "));
        } else {
          await restoreRejectedDocuments(dealId, ids);
          toast.success(`Restored ${ids.length} document${ids.length === 1 ? "" : "s"} for review`);
        }
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restore these documents");
      }
    });
  }

  return (
    <CollapsibleSection
      card
      title={title}
      description={`${rows.length} document${rows.length === 1 ? "" : "s"}`}
      defaultOpen={rows.length > 0}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(v === true)} />
              Select all
            </label>
            <div className="flex items-center gap-2">
              {restore && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={restoring || selected.size === 0}
                  onClick={handleRestore}
                  title={
                    restore === "needs"
                      ? "Puts each document back on the client need it came out of (or restores the whole need, if the entire need was marked unused)"
                      : "Puts the selected document(s) back under review on their original client need"
                  }
                >
                  <Undo2 className="size-3.5" />
                  {restoring
                    ? "Restoring…"
                    : restore === "needs"
                      ? `Put back (${selected.size})`
                      : `Restore selection (${selected.size})`}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={downloading || selected.size === 0}
                onClick={() => handleDownload([...selected], `Selected ${title}`)}
              >
                <Download className="size-3.5" />
                Download selection ({selected.size})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={downloading}
                onClick={() => handleDownload(rows.map((r) => r.id), `All ${title}`)}
              >
                <Download className="size-3.5" />
                Download all
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">Document Name</th>
                  <th className="px-3 py-2">Client Need Name</th>
                  <th className="px-3 py-2">Uploaded</th>
                  {showReason && <th className="px-3 py-2">Reason for Rejection</th>}
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, v === true)} />
                    </td>
                    <td className="px-3 py-2">
                      {renamingId === r.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename(r);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="h-7 text-sm"
                          />
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={renamePending}
                            onClick={() => saveRename(r)}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRenamingId(null)}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <a
                          href={`/api/client-need-documents/${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 hover:underline"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{r.fileName}</span>
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.cameFrom ?? r.itemName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatUploadedAt(r.createdAt)}</td>
                    {showReason && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.rejectionNote ?? "—"}
                        {r.rejectionNote && r.rejectionNoteArchived && (
                          <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                            Archived
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startRenaming(r)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Rename file"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {canMarkUnused && (
                          <button
                            type="button"
                            disabled={unusedPending}
                            onClick={() => markUnused(r)}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                            title="Mark unused: moves it to Unused without rejecting it or telling the borrower"
                          >
                            <EyeOff className="size-3.5" />
                          </button>
                        )}
                        <ChangeNeedDialog
                          dealId={dealId}
                          documentId={r.id}
                          sourceNeedId={r.clientNeedId}
                          sourceNeedName={r.itemName}
                          needs={needs}
                          catalog={catalog}
                          trigger={
                            <button type="button" className="text-muted-foreground hover:text-foreground" title="Change need">
                              <ArrowRightLeft className="size-3.5" />
                            </button>
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setDeleting(r)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete document"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {deleting && <DeleteDocumentDialog dealId={dealId} row={deleting} onClose={() => setDeleting(null)} />}
    </CollapsibleSection>
  );
}

/**
 * Insurance and title revisions, plus any miscellaneous document worth keeping.
 * Each carries its note, and they download alongside everything else.
 */
function SavedFilesSection({
  dealId,
  files,
  propertyLabel,
  title,
  allowAdd,
}: {
  dealId: string;
  files: DealFileRow[];
  propertyLabel: string;
  title: string;
  /** Only Miscellaneous takes documents added right here; insurance and title versions come from the Key Dates tab. */
  allowAdd: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const allSelected = files.length > 0 && files.every((f) => selected.has(f.id));

  const addDocument = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="size-3.5" />
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            For anything relevant to this file that doesn&apos;t belong to a client need. It&apos;s saved under Miscellaneous with your note. Insurance and title versions are uploaded from the Key Dates tab.
          </DialogDescription>
        </DialogHeader>
        <DealFileUploadForm dealId={dealId} category="other" notePlaceholder="What is this and why are we keeping it?" onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );


  async function handleDownload(ids: string[], label: string) {
    if (!ids.length) return;
    setDownloading(true);
    try {
      await downloadZip(ids, `${propertyLabel} - ${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download these documents");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <CollapsibleSection
      card
      title={title}
      description={`${files.length} document${files.length === 1 ? "" : "s"}`}
      defaultOpen
      headerExtra={allowAdd ? addDocument : undefined}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              disabled={files.length === 0}
              onCheckedChange={(v) => setSelected(v === true ? new Set(files.map((f) => f.id)) : new Set())}
            />
            Select all
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={downloading || selected.size === 0} onClick={() => handleDownload([...selected], `Selected ${title}`)}>
              <Download className="size-3.5" />
              Download selection ({selected.size})
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={downloading || files.length === 0} onClick={() => handleDownload(files.map((f) => f.id), `All ${title}`)}>
              <Download className="size-3.5" />
              Download all
            </Button>
          </div>
        </div>

        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">Document Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Added</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(f.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(f.id);
                            else next.delete(f.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <a href={`/api/deal-files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="break-all">{f.fileName}</span>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{DEAL_FILE_CATEGORY_LABELS[f.category]}</td>
                    <td className="max-w-sm px-3 py-2 whitespace-pre-wrap text-muted-foreground">{f.note ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatStamp(f.createdAt)}
                      {f.uploadedByName ? <span className="block text-xs">{f.uploadedByName}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Dialog open={editing === f.id} onOpenChange={(o) => setEditing(o ? f.id : null)}>
                        <DialogTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground" title="Edit note or delete">
                            <Pencil className="size-3.5" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>{DEAL_FILE_CATEGORY_LABELS[f.category]} document</DialogTitle>
                          </DialogHeader>
                          <DealFileEntry dealId={dealId} file={f} />
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export function DocumentsTab({
  dealId,
  accepted,
  rejected,
  unused,
  savedFiles,
  propertyLabel,
  needs,
  catalog,
}: {
  dealId: string;
  accepted: DealDocumentRow[];
  rejected: DealDocumentRow[];
  unused: DealDocumentRow[];
  savedFiles: DealFileRow[];
  propertyLabel: string;
  needs: ChangeNeedCandidate[];
  catalog: DealCatalogItem[];
}) {
  return (
    <div className="space-y-6">
      <DocumentSection
        dealId={dealId}
        title="Accepted"
        rows={accepted}
        propertyLabel={propertyLabel}
        showReason={false}
        restore={null}
        canMarkUnused
        needs={needs}
        catalog={catalog}
      />
      <SavedFilesSection
        dealId={dealId}
        title="Insurance & Title"
        files={savedFiles.filter((f) => f.category !== "other")}
        propertyLabel={propertyLabel}
        allowAdd={false}
      />
      <SavedFilesSection
        dealId={dealId}
        title="Miscellaneous"
        files={savedFiles.filter((f) => f.category === "other")}
        propertyLabel={propertyLabel}
        allowAdd
      />
      <DocumentSection
        dealId={dealId}
        title="Rejected"
        rows={rejected}
        propertyLabel={propertyLabel}
        showReason
        restore="documents"
        needs={needs}
        catalog={catalog}
      />
      <DocumentSection
        dealId={dealId}
        title="Unused"
        rows={unused}
        propertyLabel={propertyLabel}
        showReason={false}
        restore="needs"
        needs={needs}
        catalog={catalog}
      />
    </div>
  );
}
