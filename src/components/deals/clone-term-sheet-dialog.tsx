"use client";

import { useState } from "react";
import { cloneTermSheet } from "@/server/actions/term-sheets";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { allowedTermSheetCategories, loanCategoryLabel } from "@/lib/loan-type-changes";

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderName: string;
}

/**
 * Clone a term sheet, optionally as a different loan type the deal can switch
 * to (cash-out → rate & term, etc.). Everything carries over; the clone lands
 * as a draft to tweak a couple of fields, and signing it changes the loan type.
 */
export function CloneTermSheetDialog({
  dealId,
  termSheetId,
  sourceProductId,
  sourceCategory,
  sourceLenderName,
  dealLoanCategory,
  products,
  onChanged,
}: {
  dealId: string;
  termSheetId: string;
  sourceProductId: string;
  sourceCategory: string;
  sourceLenderName: string;
  dealLoanCategory: string;
  products: ProductOption[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const loanTypes = allowedTermSheetCategories(dealLoanCategory);
  const [category, setCategory] = useState(sourceCategory);
  const [productId, setProductId] = useState(sourceProductId);

  const productsForType = products.filter((p) => p.category === category);

  function chooseCategory(next: string) {
    setCategory(next);
    if (next === sourceCategory) {
      setProductId(sourceProductId);
    } else {
      // Same lender's product of that type if there's one, otherwise make them pick.
      const sameLender = products.find((p) => p.category === next && p.lenderName === sourceLenderName);
      setProductId(sameLender?.id ?? "");
    }
  }

  const action = cloneTermSheet.bind(null, dealId, termSheetId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Clone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clone term sheet</DialogTitle>
        </DialogHeader>
        <ActionForm
          action={action}
          successMessage="Cloned as a new draft — edit fields and generate its PDF"
          onSuccess={() => {
            setOpen(false);
            onChanged();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cloneCategory">Loan type</Label>
            <Select value={category} onValueChange={chooseCategory}>
              <SelectTrigger id="cloneCategory" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {loanTypes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {loanCategoryLabel(c)}
                    {c === dealLoanCategory ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category !== dealLoanCategory && (
              <p className="text-xs text-muted-foreground">
                If the borrower signs this term sheet, the deal&apos;s loan type changes from{" "}
                {loanCategoryLabel(dealLoanCategory)} to {loanCategoryLabel(category)}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cloneProductId">Lender / Product</Label>
            <Select name="productId" value={productId} onValueChange={setProductId} required>
              <SelectTrigger id="cloneProductId" className="w-full">
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
          <p className="text-xs text-muted-foreground">
            All values carry over. After cloning, use Edit fields to change what&apos;s different — any fields this loan
            type adds will be there to fill in.
          </p>
          <SubmitButton className="w-full">Clone</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
