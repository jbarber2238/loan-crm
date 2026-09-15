"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  cloneClientNeedsToProduct,
  detachClientNeedFromProduct,
} from "@/server/actions/client-need-catalog";
import { deleteLenderDocument, uploadLenderDocument } from "@/server/actions/lender-documents";
import { toggleProductActive, deleteProduct, updateProduct, updateLenderCriteria } from "@/server/actions/lenders";
import { AddProductDialog } from "@/components/lenders/add-product-dialog";
import { AddClientNeedDialog } from "@/components/client-needs/add-client-need-dialog";
import { ClientNeedDialog } from "@/components/client-needs/client-need-dialog";
import type { ExistingClientNeed } from "@/components/client-needs/client-need-form";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLIENT_NEED_TYPES, LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { formatFileSize } from "@/lib/format";

type NeedForProduct = Omit<ExistingClientNeed, "loanCategories"> & { categoryLinks: { category: string }[] };

interface ProductLink {
  id: string;
  sortOrder: number;
  clientNeedId: string;
  clientNeed: NeedForProduct;
}

interface ProductWithRelations {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
  category: string;
  criteria: { otherNotes: string | null } | null;
  clientNeeds: ProductLink[];
}

interface LenderDocument {
  id: string;
  productId: string | null;
  fileName: string;
  fileSize: number;
}

interface CatalogItem {
  id: string;
  itemName: string;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form";
  isCustom: boolean;
}

interface OtherProduct {
  id: string;
  name: string;
  lender: { name: string };
}

export function ProductsChecklist({
  lenderId,
  products,
  lenderDocuments,
  fullCatalog,
  otherProducts,
  allProductOptions,
  availableCategories,
  isAdmin,
  canEditClientNeeds,
}: {
  lenderId: string;
  products: ProductWithRelations[];
  lenderDocuments: LenderDocument[];
  fullCatalog: CatalogItem[];
  otherProducts: OtherProduct[];
  allProductOptions: { id: string; label: string }[];
  availableCategories: { value: string; label: string }[];
  isAdmin: boolean;
  canEditClientNeeds: boolean;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const allExpanded = products.length > 0 && products.every((p) => openIds.has(p.id));

  function setOpen(id: string, open: boolean) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Products</CardTitle>
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpenIds(allExpanded ? new Set() : new Set(products.map((p) => p.id)))}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          {isAdmin && availableCategories.length > 0 && (
            <AddProductDialog lenderId={lenderId} availableCategories={availableCategories} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {products.map((product) => {
          const productDocs = lenderDocuments.filter((d) => d.productId === product.id);
          const sortedLinks = [...product.clientNeeds].sort((a, b) => a.sortOrder - b.sortOrder);
          const attachedIds = new Set(sortedLinks.map((l) => l.clientNeedId));
          const availableCatalog = fullCatalog.filter((c) => !attachedIds.has(c.id));
          const uploadDocForProduct = uploadLenderDocument.bind(null, lenderId);

          return (
            <Collapsible
              key={product.id}
              open={openIds.has(product.id)}
              onOpenChange={(v) => setOpen(product.id, v)}
              className="group rounded-md border"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm">
                <span className="flex items-center gap-2">
                  {product.name}
                  {!product.active && <Badge variant="secondary">Inactive</Badge>}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-5 border-t p-4">
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Product Details
                  </p>
                  {isAdmin ? (
                    <div className="space-y-3">
                      <ActionForm
                        action={updateProduct.bind(null, product.id)}
                        successMessage="Product saved"
                        className="space-y-3"
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor={`category-${product.id}`}>Category</Label>
                          <Select name="category" defaultValue={product.category} required>
                            <SelectTrigger id={`category-${product.id}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LOAN_CATEGORIES.map((cat) => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`notes-${product.id}`}>Notes</Label>
                          <Textarea id={`notes-${product.id}`} name="notes" rows={2} defaultValue={product.notes ?? ""} />
                        </div>
                        <SubmitButton size="sm">Save</SubmitButton>
                      </ActionForm>
                      <div className="flex items-center justify-between">
                        <ActionForm
                          action={toggleProductActive.bind(null, product.id, !product.active)}
                          successMessage={product.active ? "Marked inactive" : "Marked active"}
                        >
                          <SubmitButton size="sm" variant="outline">
                            {product.active ? "Mark inactive" : "Mark active"}
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm
                          action={deleteProduct.bind(null, lenderId, product.id)}
                          successMessage="Product deleted"
                          confirmMessage={`Delete this ${product.name} product? This removes its criteria, client-need checklist, and documents too.`}
                        >
                          <SubmitButton size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            Delete
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {product.notes || "No notes."}
                    </p>
                  )}
                </div>

                {(isAdmin || product.criteria?.otherNotes) && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Notes for AI Matching
                    </p>
                    {isAdmin ? (
                      <ActionForm
                        action={updateLenderCriteria.bind(null, product.id)}
                        successMessage="Notes saved"
                        className="space-y-2"
                      >
                        <Textarea
                          name="otherNotes"
                          rows={2}
                          defaultValue={product.criteria?.otherNotes ?? ""}
                          placeholder="Anything worth calling out that isn't obvious from the uploaded documents"
                        />
                        <SubmitButton size="sm">Save</SubmitButton>
                      </ActionForm>
                    ) : (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {product.criteria?.otherNotes}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Matrix and Guidelines
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Only documents filed under {product.name} show here.
                  </p>
                  <div className="space-y-1">
                    {productDocs.map((doc) => {
                      const deleteDoc = deleteLenderDocument.bind(null, lenderId, doc.id);
                      return (
                        <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <a
                            href={`/api/lender-documents/${doc.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {doc.fileName}
                          </a>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                            {isAdmin && (
                              <ActionForm action={deleteDoc} successMessage="Document removed">
                                <SubmitButton size="sm" variant="ghost">
                                  Remove
                                </SubmitButton>
                              </ActionForm>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {productDocs.length === 0 && (
                      <p className="text-sm text-muted-foreground">No documents yet.</p>
                    )}
                  </div>
                  {isAdmin && (
                    <ActionForm
                      action={uploadDocForProduct}
                      successMessage="Document uploaded"
                      className="mt-2 flex items-end gap-2"
                    >
                      <input type="hidden" name="productId" value={product.id} />
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`file-${product.id}`}>Add a document directly to this product</Label>
                        <Input id={`file-${product.id}`} name="file" type="file" multiple required />
                      </div>
                      <SubmitButton size="sm">Upload</SubmitButton>
                    </ActionForm>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Client Needs
                    </p>
                    {canEditClientNeeds && (
                      <AddClientNeedDialog
                        productId={product.id}
                        availableCatalog={availableCatalog}
                        allProducts={allProductOptions}
                      />
                    )}
                  </div>
                  <ul className="space-y-2">
                    {sortedLinks.map((link) => {
                      const need = link.clientNeed;
                      const detach = detachClientNeedFromProduct.bind(null, product.id, need.id);
                      const typeLabel = labelFor(CLIENT_NEED_TYPES, need.needType);
                      return (
                        <li key={link.id} className="rounded-md border px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{need.itemName}</p>
                                <Badge variant="secondary">{typeLabel}</Badge>
                                {need.isCustom && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Custom
                                  </Badge>
                                )}
                              </div>
                              {need.description && (
                                <p className="text-muted-foreground">{need.description}</p>
                              )}
                              {need.needType === "esign" && need.esignVendor && (
                                <p className="text-xs text-muted-foreground">Via {need.esignVendor}</p>
                              )}
                              {need.needType === "document_upload" && need.templateFileName && (
                                <a
                                  href={`/api/client-needs/${need.id}/file`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-muted-foreground hover:underline"
                                >
                                  Template: {need.templateFileName}
                                </a>
                              )}
                              {need.needType === "questionnaire" && need.questions.length > 0 && (
                                <ul className="list-inside list-disc text-xs text-muted-foreground">
                                  {need.questions.map((q, i) => (
                                    <li key={i}>{q.questionText}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            {canEditClientNeeds && (
                              <div className="flex shrink-0 items-center gap-1">
                                <ClientNeedDialog
                                  clientNeed={{ ...need, loanCategories: need.categoryLinks.map((l) => l.category) }}
                                  allProducts={allProductOptions}
                                  trigger={
                                    <Button size="sm" variant="ghost">
                                      Edit
                                    </Button>
                                  }
                                />
                                <ActionForm action={detach} successMessage="Removed">
                                  <SubmitButton size="sm" variant="ghost">
                                    Remove
                                  </SubmitButton>
                                </ActionForm>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {sortedLinks.length === 0 && (
                      <p className="text-sm text-muted-foreground">No client needs added yet.</p>
                    )}
                  </ul>

                  {canEditClientNeeds && otherProducts.length > 0 && (
                    <ActionForm
                      action={cloneClientNeedsToProduct.bind(null, product.id)}
                      successMessage="Needs added"
                      className="mt-3 flex items-end gap-2 border-t pt-3"
                    >
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`clone-${product.id}`}>Add all needs from another product</Label>
                        <Select name="sourceProductId">
                          <SelectTrigger id={`clone-${product.id}`} className="w-full">
                            <SelectValue placeholder="Select a product" />
                          </SelectTrigger>
                          <SelectContent>
                            {otherProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.lender.name} — {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <SubmitButton size="sm" variant="secondary">
                        Add
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        {products.length === 0 && (
          <p className="text-sm text-muted-foreground">No products yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
