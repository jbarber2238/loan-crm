"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { termSheetFieldsFor, ADMIN_ONLY_FIELDS } from "@/lib/term-sheet-fields";

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderName: string;
}

export function NewTermSheetForm({
  dealId,
  products,
  isAdmin,
}: {
  dealId: string;
  products: ProductOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");
  const product = products.find((p) => p.id === productId);

  const fields = useMemo(
    () => (product ? termSheetFieldsFor(product.category) : []),
    [product]
  );

  const action = createTermSheet.bind(null, dealId);

  return (
    <form
      action={async (formData) => {
        await action(formData);
        router.refresh();
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="productId">Lender / Product</Label>
        <Select name="productId" value={productId} onValueChange={setProductId} required>
          <SelectTrigger id="productId" className="w-full">
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.lenderName} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {product && (
        <TermSheetFieldInputs
          fields={isAdmin ? [...fields, ...ADMIN_ONLY_FIELDS] : fields}
        />
      )}

      <Button type="submit" className="w-full" disabled={!productId}>
        Save draft
      </Button>
    </form>
  );
}
