"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import type { TermSheetExtractionOption } from "@/server/ai/term-sheet-extraction";

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderId: string;
}

// Shared by the lender-reply and quick-pricer-screenshot flows: a lender's
// single reply often prices more than one program (a 30-year fixed vs. a
// 5/6 ARM, different point buydowns, etc.), and hand-copying each into its
// own term sheet used to mean re-running extraction or re-typing by hand.
// This shows every option the AI found as its own pick, remounting the form
// underneath (via `key`) when you switch — so you can review one, save it as
// a draft, then move to the next without losing your place.
export function TermSheetExtractionReview({
  dealId,
  loanCategory,
  options,
  notes,
  lenderProducts,
  purchasePrice = null,
  estimatedAsIsValue = null,
  onDone,
}: {
  dealId: string;
  loanCategory: string;
  options: TermSheetExtractionOption[];
  notes: string | null;
  lenderProducts: ProductOption[];
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set());
  const [productId, setProductId] = useState(() => {
    const defaultProduct = lenderProducts.find((p) => p.category === loanCategory) ?? lenderProducts[0];
    return defaultProduct?.id ?? "";
  });
  const [creating, startCreate] = useTransition();

  const option = options[selected];

  function handleCreateTermSheet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startCreate(async () => {
      try {
        await createTermSheet(dealId, formData);
        setSavedIndexes((prev) => new Set(prev).add(selected));
        toast.success(
          options.length > 1 ? `Saved "${option.label}" as a draft term sheet` : "Term sheet created"
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't create the term sheet.");
      }
    });
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Review before saving</p>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>

      {options.length > 1 && (
        <div className="space-y-1.5">
          <Label>
            {options.length} pricing options offered — review one, save it, then pick the next
          </Label>
          <div className="flex flex-wrap gap-2">
            {options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                  i === selected ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {savedIndexes.has(i) && "✓ "}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {notes && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notes}
        </p>
      )}
      {option.notFoundKeys.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Couldn&apos;t find in the reply — fill these in manually: {option.notFoundKeys.join(", ")}
        </p>
      )}

      <form key={selected} onSubmit={handleCreateTermSheet} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <TermSheetFieldInputs
          fields={termSheetFieldsFor(loanCategory)}
          values={option.fields}
          category={loanCategory}
          purchasePrice={purchasePrice}
          estimatedAsIsValue={estimatedAsIsValue}
          productSelector={
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
          }
        />
        <Button type="submit" className="w-full" disabled={!productId || creating}>
          {creating
            ? "Saving…"
            : savedIndexes.has(selected)
              ? "Save again as another draft"
              : "Save as draft term sheet"}
        </Button>
      </form>
    </div>
  );
}
