"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  uploadAppraisalDocument,
  deleteAppraisalDocument,
  applyAppraisalExtraction,
} from "@/server/actions/deals";
import { extractAppraisalData, type AppraisalExtractionResult } from "@/server/ai/appraisal-extraction";

const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);
const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

export function AppraisalDocumentCell({
  dealId,
  loanCategory,
  fileName,
}: {
  dealId: string;
  loanCategory: string;
  fileName: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();

  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, startScan] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<AppraisalExtractionResult | null>(null);
  const [applying, startApply] = useTransition();

  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(loanCategory);
  const isDscr = DSCR_CATEGORIES.has(loanCategory) || loanCategory === "portfolio";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startUpload(async () => {
      try {
        await uploadAppraisalDocument(dealId, formData);
        toast.success("Appraisal uploaded");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't upload this file.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function handleRemove() {
    startRemove(async () => {
      try {
        await deleteAppraisalDocument(dealId);
        toast.success("Appraisal removed");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't remove this file.");
      }
    });
  }

  function handleScanOpenChange(next: boolean) {
    setScanOpen(next);
    if (!next) return;
    setScanError(null);
    setResult(null);
    startScan(async () => {
      try {
        setResult(await extractAppraisalData(dealId));
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Couldn't read this appraisal.");
      }
    });
  }

  function handleApply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startApply(async () => {
      try {
        await applyAppraisalExtraction(dealId, formData);
        setScanOpen(false);
        toast.success("Applied to deal");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't apply these values.");
      }
    });
  }

  if (!fileName) {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={`/api/deals/${dealId}/appraisal-document`}
        target="_blank"
        rel="noreferrer"
        className="max-w-[10rem] truncate text-xs underline decoration-dotted underline-offset-2"
        title={fileName}
      >
        {fileName}
      </a>
      <Button type="button" size="sm" variant="outline" onClick={() => handleScanOpenChange(true)}>
        <Sparkles className="size-3.5" />
        Scan with AI
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        title="Remove"
        aria-label="Remove appraisal document"
        disabled={removing}
        onClick={handleRemove}
      >
        <X className="size-3.5" />
      </Button>

      <Dialog open={scanOpen} onOpenChange={handleScanOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appraisal scan</DialogTitle>
          </DialogHeader>
          {scanning ? (
            <p className="text-sm text-muted-foreground">Reading the appraisal…</p>
          ) : scanError ? (
            <p className="text-sm text-destructive">{scanError}</p>
          ) : result ? (
            <form onSubmit={handleApply} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="appraisedValue">
                  {isHardMoneyDraw ? "As-Is Value" : "Appraised Value"}
                </Label>
                <Input
                  id="appraisedValue"
                  name="appraisedValue"
                  type="number"
                  defaultValue={result.appraisedValue ?? ""}
                />
              </div>
              {isHardMoneyDraw && (
                <div className="space-y-1.5">
                  <Label htmlFor="appraisedArv">ARV (After Repair Value)</Label>
                  <Input id="appraisedArv" name="appraisedArv" type="number" defaultValue={result.appraisedArv ?? ""} />
                </div>
              )}
              {isDscr && (
                <div className="space-y-1.5">
                  <Label>Market Rent (from the rent schedule)</Label>
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {result.marketRent !== null ? `$${result.marketRent.toLocaleString()}` : "Not found"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shown for reference only — there&apos;s no field for this on the deal yet, so it isn&apos;t
                    saved anywhere. Let Justin know where you&apos;d like it to live.
                  </p>
                </div>
              )}
              {result.notFound.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Couldn&apos;t find in the report: {result.notFound.join(", ")}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={applying}>
                {applying ? "Applying…" : "Apply to deal"}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
