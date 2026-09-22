"use client";

import { useRef, useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { extractTermSheetFromScreenshot, type TermSheetExtractionOption } from "@/server/ai/term-sheet-extraction";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TermSheetExtractionReview } from "@/components/deals/term-sheet-extraction-review";
import { originationFeeSuggestion } from "@/lib/term-sheet-calculations";

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderId: string;
}

export function QuickPricerCard({
  dealId,
  lenderId,
  lenderName,
  quickPricerUrl,
  loanCategory,
  products,
  purchasePrice = null,
  estimatedAsIsValue = null,
}: {
  dealId: string;
  lenderId: string;
  lenderName: string;
  quickPricerUrl: string;
  loanCategory: string;
  products: ProductOption[];
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, startRead] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<TermSheetExtractionOption[] | null>(null);
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);

  const lenderProducts = products.filter((p) => p.lenderId === lenderId);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startRead(async () => {
      try {
        const dataBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        const result = await extractTermSheetFromScreenshot({
          category: loanCategory,
          file: { fileName: file.name, mimeType: file.type || "image/png", dataBase64 },
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
              notFoundKeys: opt.notFoundKeys.filter((k) => k !== "originationFee" && k !== "reservesMonths"),
            };
          })
        );
        setExtractionNotes(result.notes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read that screenshot.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{lenderName} has a quick pricer</p>
        <Button asChild size="sm" variant="outline">
          <a href={quickPricerUrl} target="_blank" rel="noreferrer">
            Open Quick Pricer <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Price it directly on their site, then snap a screenshot of the results and drop it below to get a
        head start on the term sheet.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`quick-pricer-file-${lenderId}`}>Upload a screenshot of the pricing results</Label>
        <input
          ref={inputRef}
          id={`quick-pricer-file-${lenderId}`}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileChange}
          disabled={reading}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        {reading && <p className="text-xs text-muted-foreground">Reading screenshot…</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

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

      {lenderProducts.length === 0 && options === null && (
        <p className="text-xs text-muted-foreground">No products on file for this lender yet.</p>
      )}
    </div>
  );
}
