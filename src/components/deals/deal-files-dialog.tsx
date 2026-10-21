"use client";

import { Upload } from "lucide-react";
import { DealFileEntry, DealFileUploadForm } from "@/components/deals/deal-file-parts";
import { versionLabels, type DealFileRow } from "@/lib/deal-files";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * The Upload button on a Key Dates row for insurance or title: every upload is
 * kept as its own version with its own note, newest first, and also lands on
 * the Documents tab.
 */
export function DealFilesDialog({
  dealId,
  category,
  label,
  files,
}: {
  dealId: string;
  category: "insurance" | "title";
  label: string;
  files: DealFileRow[];
}) {
  const mine = files.filter((f) => f.category === category);
  const versions = versionLabels(mine);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Upload className="size-3.5" />
          Upload{mine.length > 0 ? ` (${mine.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{label} documents</DialogTitle>
          <DialogDescription>
            Upload each revision as its own document with a note on what changed. Older versions stay here and in the audit trail, and everything is on the Documents tab too.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {mine.length > 0 ? (
            <div className="space-y-2">
              {mine.map((f) => (
                <DealFileEntry key={f.id} dealId={dealId} file={f} version={versions.get(f.id)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
          )}
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium">{mine.length > 0 ? "Upload a new version" : "Upload a document"}</p>
            <DealFileUploadForm
              dealId={dealId}
              category={category}
              notePlaceholder={category === "insurance" ? "e.g. Binder with corrected mortgagee clause" : "e.g. Revised commitment: removed exception 4"}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
