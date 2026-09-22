"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveManualPricingReply } from "@/server/actions/pricing";
import { extractTermSheetFromReply, type TermSheetExtractionOption } from "@/server/ai/term-sheet-extraction";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { TermSheetExtractionReview } from "@/components/deals/term-sheet-extraction-review";
import { originationFeeSuggestion } from "@/lib/term-sheet-calculations";

interface ReplyAttachment {
  id: string;
  fileName: string;
  mimeType: string;
}

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderId: string;
}

export function ReplyImportView({
  dealId,
  pricingRequestId,
  lenderId,
  loanCategory,
  replyReceivedAt,
  replyBodyText,
  attachments,
  products,
  purchasePrice = null,
  estimatedAsIsValue = null,
}: {
  dealId: string;
  pricingRequestId: string;
  lenderId: string;
  loanCategory: string;
  replyReceivedAt: Date | null;
  replyBodyText: string | null;
  attachments: ReplyAttachment[];
  products: ProductOption[];
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
}) {
  const router = useRouter();
  const saveReply = saveManualPricingReply.bind(null, dealId, pricingRequestId);
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState(false);
  const replyFormRef = useRef<HTMLFormElement>(null);

  const [extracting, startExtract] = useTransition();
  const [extractError, setExtractError] = useState<string | null>(null);
  const [options, setOptions] = useState<TermSheetExtractionOption[] | null>(null);
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);

  const lenderProducts = products.filter((p) => p.lenderId === lenderId);
  const hasReply = Boolean(replyBodyText || attachments.length);

  function handleSaveReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    const formData = new FormData(e.currentTarget);
    startSave(async () => {
      try {
        await saveReply(formData);
        toast.success("Reply saved");
        setEditingReply(false);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't save the reply.";
        setSaveError(message);
        toast.error(message);
      }
    });
  }

  function handleExtract() {
    setExtractError(null);
    startExtract(async () => {
      try {
        const result = await extractTermSheetFromReply({
          pricingRequestId,
          category: loanCategory,
        });
        setOptions(
          result.options.map((opt) => {
            const loanAmount = Number(opt.fields.loanAmount);
            const fields =
              opt.fields.originationFee === undefined && loanAmount
                ? { ...opt.fields, originationFee: originationFeeSuggestion(loanAmount) }
                : opt.fields;
            return {
              ...opt,
              fields,
              notFoundKeys: opt.notFoundKeys.filter((k) => k !== "reservesMonths"),
            };
          })
        );
        setExtractionNotes(result.notes);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Extraction failed.";
        setExtractError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Lender Reply</p>
        {hasReply && !editingReply && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingReply(true)}>
            Replace
          </Button>
        )}
      </div>

      {(!hasReply || editingReply) && (
        <form ref={replyFormRef} onSubmit={handleSaveReply} className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor={`replyBodyText-${pricingRequestId}`}>Paste the lender&apos;s email</Label>
            <Textarea
              id={`replyBodyText-${pricingRequestId}`}
              name="replyBodyText"
              rows={5}
              defaultValue={replyBodyText ?? ""}
              placeholder="Paste the reply text here..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`replyFile-${pricingRequestId}`}>Or upload the PDF/screenshot they sent</Label>
            <Input id={`replyFile-${pricingRequestId}`} name="file" type="file" multiple />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save reply"}
            </Button>
            {editingReply && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingReply(false)}>
                Cancel
              </Button>
            )}
          </div>
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </form>
      )}

      {hasReply && !editingReply && (
        <div className="space-y-2">
          {replyReceivedAt && (
            <p className="text-xs text-muted-foreground">Added {new Date(replyReceivedAt).toLocaleString()}</p>
          )}
          {replyBodyText && (
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">
              {replyBodyText}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/pricing-request-attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent/50"
                >
                  {a.fileName}
                </a>
              ))}
            </div>
          )}

          {!options && (
            <Button type="button" size="sm" onClick={handleExtract} disabled={extracting}>
              {extracting ? "Reading reply…" : "Draft term sheet from this reply"}
            </Button>
          )}
          {extractError && <p className="text-sm text-destructive">{extractError}</p>}
        </div>
      )}

      {options && (
        <TermSheetExtractionReview
          dealId={dealId}
          loanCategory={loanCategory}
          options={options}
          notes={extractionNotes}
          lenderProducts={lenderProducts}
          purchasePrice={purchasePrice}
          estimatedAsIsValue={estimatedAsIsValue}
          onDone={() => {
            setOptions(null);
            setExtractionNotes(null);
          }}
        />
      )}

      {hasReply && lenderProducts.length === 0 && options === null && (
        <Badge variant="secondary">No products on file for this lender yet</Badge>
      )}
    </div>
  );
}
