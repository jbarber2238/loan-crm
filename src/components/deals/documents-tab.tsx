"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileText, Undo2, Pencil, Check, X, ArrowRightLeft, Plus } from "lucide-react";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { restoreRejectedDocuments, renameClientNeedDocument } from "@/server/actions/client-need-documents";
import { restoreClientNeeds } from "@/server/actions/client-needs";
import type { DealDocumentRow } from "@/server/actions/client-need-documents";
import { ChangeNeedDialog, type ChangeNeedCandidate } from "@/components/deals/change-need-dialog";
import { DealFileEntry, DealFileUploadForm, formatStamp } from "@/components/deals/deal-file-parts";
import { DEAL_FILE_CATEGORY_LABELS, type DealFileRow } from "@/lib/deal-files";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";

async function downloadZip(ids: string[], zipName: string) {
  const res = await fetch("/api/client-need-documents/download-zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, zipName }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Download failed"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DocumentSection({
  dealId,
  title,
  rows,
  propertyLabel,
  showReason,
  restore,
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
  needs: ChangeNeedCandidate[];
  catalog: DealCatalogItem[];
}) {
  const router = useRouter();
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

  function handleRestore() {
    const ids = [...selected];
    if (!ids.length) return;
    startRestore(async () => {
      try {
        if (restore === "needs") {
          const needIds = [...new Set(rows.filter((r) => selected.has(r.id)).map((r) => r.clientNeedId))];
          const count = await restoreClientNeeds(dealId, needIds);
          toast.success(`Restored ${count} client need${count === 1 ? "" : "s"} to the Client Needs list`);
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
                      ? "Puts the client need(s) these documents belong to back on the Client Needs list"
                      : "Puts the selected document(s) back under review on their original client need"
                  }
                >
                  <Undo2 className="size-3.5" />
                  {restoring
                    ? "Restoring…"
                    : restore === "needs"
                      ? `Restore need (${selected.size})`
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
                  {showReason && <th className="px-3 py-2">Reason for Rejection</th>}
                  <th className="w-16 px-3 py-2" />
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
                    <td className="px-3 py-2 text-muted-foreground">{r.itemName}</td>
                    {showReason && (
                      <td className="px-3 py-2 text-muted-foreground">{r.rejectionNote ?? "—"}</td>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
