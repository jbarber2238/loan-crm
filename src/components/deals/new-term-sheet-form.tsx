"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createTermSheet } from "@/server/actions/term-sheets";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TermSheetFieldInputs } from "@/components/deals/term-sheet-field-inputs";
import { termSheetFieldsFor, ADMIN_ONLY_FIELDS } from "@/lib/term-sheet-fields";
import { allowedTermSheetCategories, loanCategoryLabel } from "@/lib/loan-type-changes";

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderName: string;
}

export function NewTermSheetForm({
  dealId,
  loanCategory,
  products,
  isAdmin,
  purchasePrice = null,
  estimatedAsIsValue = null,
}: {
  dealId: string;
  loanCategory: string;
  products: ProductOption[];
  isAdmin: boolean;
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
}) {
  const router = useRouter();
  // The deal's own loan type first, then the ones it can be switched to if
  // the borrower signs a term sheet of that type (see loan-type-changes.ts).
  const loanTypes = allowedTermSheetCategories(loanCategory);
  const [quotedCategory, setQuotedCategory] = useState<string>(loanCategory);
  const [productId, setProductId] = useState<string>("");
  const productsForType = products.filter((p) => p.category === quotedCategory);
  const product = products.find((p) => p.id === productId);

  const fields = useMemo(
    () => (product ? termSheetFieldsFor(product.category) : []),
    [product]
  );

  const action = createTermSheet.bind(null, dealId);

  const productSelector = (
    <div className="space-y-3">
      {loanTypes.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="quotedCategory">Loan type</Label>
          <Select
            value={quotedCategory}
            onValueChange={(v) => {
              setQuotedCategory(v);
              setProductId("");
            }}
          >
            <SelectTrigger id="quotedCategory" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {loanTypes.map((c) => (
                <SelectItem key={c} value={c}>
                  {loanCategoryLabel(c)}
                  {c === loanCategory ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {quotedCategory !== loanCategory && (
            <p className="text-xs text-muted-foreground">
              If the borrower signs this term sheet, the deal&apos;s loan type changes from{" "}
              {loanCategoryLabel(loanCategory)} to {loanCategoryLabel(quotedCategory)}.
            </p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="productId">Lender / Product</Label>
        <Select name="productId" value={productId} onValueChange={setProductId} required>
          <SelectTrigger id="productId" className="w-full">
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {productsForType.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.lenderName} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <ActionForm
      action={action}
      successMessage="Term sheet created"
      onSuccess={() => router.refresh()}
      className="space-y-4"
    >
      {product ? (
        <TermSheetFieldInputs
          fields={isAdmin ? [...fields, ...ADMIN_ONLY_FIELDS] : fields}
          productSelector={productSelector}
          category={product.category}
          purchasePrice={purchasePrice}
          estimatedAsIsValue={estimatedAsIsValue}
        />
      ) : (
        productSelector
      )}

      <SubmitButton className="w-full" disabled={!productId}>
        Save draft
      </SubmitButton>
    </ActionForm>
  );
}
