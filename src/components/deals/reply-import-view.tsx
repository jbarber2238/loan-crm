"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkPricingRequestReply } from "@/server/actions/pricing";
import { extractTermSheetFromReply } from "@/server/ai/term-sheet-extraction";
import { createTermSheet } from "@/server/actions/term-sheets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TermSheetFieldInputs } from "@/components/deals/term-sheet-field-inputs";
import { termSheetFieldsFor } from "@/lib/term-sheet-fields";
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
  replyCheckedAt,
  replyFrom,
  replyReceivedAt,
  replyBodyText,
  attachments,
  products,
}: {
  dealId: string;
  pricingRequestId: string;
  lenderId: string;
  loanCategory: string;
  replyCheckedAt: Date | null;
  replyFrom: string | null;
  replyReceivedAt: Date | null;
  replyBodyText: string | null;
  attachments: ReplyAttachment[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const checkReply = checkPricingRequestReply.bind(null, dealId, pricingRequestId);
  const [checking, startCheck] = useTransition();
  const [checkError, setCheckError] = useState<string | null>(null);

  const [extracting, startExtract] = useTransition();
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Record<string, string | number> | null>(null);
  const [notFoundKeys, setNotFoundKeys] = useState<string[]>([]);
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [creating, startCreate] = useTransition();
  const [created, setCreated] = useState(false);

  const lenderProducts = products.filter((p) => p.lenderId === lenderId);
  const hasReply = Boolean(replyBodyText || attachments.length);

  function handleCheck() {
    setCheckError(null);
    startCheck(async () => {
      try {
        await checkReply();
        router.refresh();
      } catch (err) {
        setCheckError(err instanceof Error ? err.message : "Couldn't check for a reply.");
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
        const loanAmount = Number(result.fields.loanAmount);
        const fieldsWithDefaults =
          result.fields.originationFee === undefined && loanAmount
            ? { ...result.fields, originationFee: originationFeeSuggestion(loanAmount) }
            : result.fields;
        setExtracted(fieldsWithDefaults);
        setNotFoundKeys(result.notFoundKeys.filter((k) => k !== "originationFee" && k !== "reservesMonths"));
        setExtractionNotes(result.notes);
        if (!productId) {
          const defaultProduct = lenderProducts.find((p) => p.category === loanCategory) ?? lenderProducts[0];
          if (defaultProduct) setProductId(defaultProduct.id);
        }
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : "Extraction failed.");
      }
    });
  }

  function handleCreateTermSheet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startCreate(async () => {
      await createTermSheet(dealId, formData);
      setExtracted(null);
      setNotFoundKeys([]);
      setExtractionNotes(null);
      setCreated(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Lender Reply</p>
        <Button type="button" size="sm" variant="outline" onClick={handleCheck} disabled={checking}>
          {checking ? "Checking…" : "Check for reply"}
        </Button>
      </div>

      {checkError && <p className="text-sm text-destructive">{checkError}</p>}

      {replyCheckedAt && (
        <p className="text-xs text-muted-foreground">
          Last checked {new Date(replyCheckedAt).toLocaleString()}
          {!hasReply && " — no reply yet."}
        </p>
      )}

      {hasReply && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            From {replyFrom} {replyReceivedAt && `— ${new Date(replyReceivedAt).toLocaleString()}`}
          </p>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">
            {replyBodyText || "(no plain text body — see attachments)"}
          </div>
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

          {!extracted && (
            <Button type="button" size="sm" onClick={handleExtract} disabled={extracting}>
              {extracting ? "Reading reply…" : "Draft term sheet from this reply"}
            </Button>
          )}
          {extractError && <p className="text-sm text-destructive">{extractError}</p>}
          {created && (
            <p className="text-sm text-muted-foreground">
              Term sheet created as a draft — find it on the Term Sheets tab.
            </p>
          )}
        </div>
      )}

      {extracted && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Review before saving</p>
          {extractionNotes && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {extractionNotes}
            </p>
          )}
          {notFoundKeys.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t find in the reply — fill these in manually: {notFoundKeys.join(", ")}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="productId">Lender / Product</Label>
            <Select name="productId" value={productId} onValueChange={setProductId} required>
              <SelectTrigger id="productId" className="w-full">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {lenderProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={handleCreateTermSheet} className="space-y-3">
            <input type="hidden" name="productId" value={productId} />
            <TermSheetFieldInputs fields={termSheetFieldsFor(loanCategory)} values={extracted} />
            <Button type="submit" className="w-full" disabled={!productId || creating}>
              {creating ? "Saving…" : "Save as draft term sheet"}
            </Button>
          </form>
        </div>
      )}

      {hasReply && lenderProducts.length === 0 && extracted === null && (
        <Badge variant="secondary">No products on file for this lender yet</Badge>
      )}
    </div>
  );
}
