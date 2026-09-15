"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { extractTermSheetFromScreenshot } from "@/server/ai/term-sheet-extraction";
import { createTermSheet } from "@/server/actions/term-sheets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TermSheetFieldInputs } from "@/components/deals/term-sheet-field-inputs";
import { termSheetFieldsFor } from "@/lib/term-sheet-fields";
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
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, startRead] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Record<string, string | number> | null>(null);
  const [notFoundKeys, setNotFoundKeys] = useState<string[]>([]);
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [creating, startCreate] = useTransition();
  const [created, setCreated] = useState(false);

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
        setError(err instanceof Error ? err.message : "Couldn't read that screenshot.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function handleCreateTermSheet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startCreate(async () => {
      try {
        await createTermSheet(dealId, formData);
        setExtracted(null);
        setNotFoundKeys([]);
        setExtractionNotes(null);
        setCreated(true);
        toast.success("Term sheet created");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't create the term sheet.");
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
      {created && !extracted && (
        <p className="text-sm text-muted-foreground">Term sheet created as a draft — find it on the Term Sheets tab.</p>
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
              Couldn&apos;t find in the screenshot — fill these in manually: {notFoundKeys.join(", ")}
            </p>
          )}
          <form onSubmit={handleCreateTermSheet} className="space-y-3">
            <input type="hidden" name="productId" value={productId} />
            <TermSheetFieldInputs
              fields={termSheetFieldsFor(loanCategory)}
              values={extracted}
              category={loanCategory}
              purchasePrice={purchasePrice}
              estimatedAsIsValue={estimatedAsIsValue}
              productSelector={
                <div className="space-y-1.5">
                  <Label htmlFor={`quick-pricer-product-${lenderId}`}>Lender / Product</Label>
                  <Select name="productId" value={productId} onValueChange={setProductId} required>
                    <SelectTrigger id={`quick-pricer-product-${lenderId}`} className="w-full">
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
              }
            />
            <Button type="submit" className="w-full" disabled={!productId || creating}>
              {creating ? "Saving…" : "Save as draft term sheet"}
            </Button>
          </form>
        </div>
      )}

      {lenderProducts.length === 0 && extracted === null && (
        <p className="text-xs text-muted-foreground">No products on file for this lender yet.</p>
      )}
    </div>
  );
}
