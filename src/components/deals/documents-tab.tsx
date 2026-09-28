"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileText, Undo2 } from "lucide-react";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { restoreRejectedDocuments } from "@/server/actions/client-need-documents";
import type { DealDocumentRow } from "@/server/actions/client-need-documents";

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
  showRestore,
}: {
  dealId: string;
  title: string;
  rows: DealDocumentRow[];
  propertyLabel: string;
  showReason: boolean;
  showRestore: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [restoring, startRestore] = useTransition();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

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
        await restoreRejectedDocuments(dealId, ids);
        toast.success(`Restored ${ids.length} document${ids.length === 1 ? "" : "s"} for review`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't restore these documents");
      }
    });
  }

  return (
    <CollapsibleSection
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
              {showRestore && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={restoring || selected.size === 0}
                  onClick={handleRestore}
                  title="Puts the selected document(s) back under review on their original client need"
                >
                  <Undo2 className="size-3.5" />
                  {restoring ? "Restoring…" : `Restore selection (${selected.size})`}
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
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, v === true)} />
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`/api/client-need-documents/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 hover:underline"
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.fileName}</span>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.itemName}</td>
                    {showReason && (
                      <td className="px-3 py-2 text-muted-foreground">{r.rejectionNote ?? "—"}</td>
                    )}
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

export function DocumentsTab({
  dealId,
  accepted,
  rejected,
  propertyLabel,
}: {
  dealId: string;
  accepted: DealDocumentRow[];
  rejected: DealDocumentRow[];
  propertyLabel: string;
}) {
  return (
    <div className="space-y-6">
      <DocumentSection
        dealId={dealId}
        title="Accepted"
        rows={accepted}
        propertyLabel={propertyLabel}
        showReason={false}
        showRestore={false}
      />
      <DocumentSection
        dealId={dealId}
        title="Rejected"
        rows={rejected}
        propertyLabel={propertyLabel}
        showReason
        showRestore
      />
    </div>
  );
}
