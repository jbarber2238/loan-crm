"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  cloneClientNeedsToProduct,
  detachClientNeedFromProduct,
} from "@/server/actions/client-need-catalog";
import { deleteLenderDocument, uploadLenderDocument, reextractProductCriteria } from "@/server/actions/lender-documents";
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

interface CriteriaTier {
  id: string;
  ficoMin: number | null;
  ficoMax: number | null;
  experienceMin: number | null;
  maxLtc: string | null;
  maxLtarv: string | null;
  maxLtv: string | null;
  notes: string | null;
}

interface Criteria {
  otherNotes: string | null;
  minFico: number | null;
  minLoanAmount: string | null;
  maxLoanAmount: string | null;
  statesAllowed: string[] | null;
  propertyTypesAllowed: string[] | null;
  minDscr: string | null;
  maxLtv: string | null;
  maxLtc: string | null;
  maxLtarv: string | null;
  minExperienceCount: number | null;
  entityOnlyRequired: boolean | null;
  gcLicenseRequired: boolean | null;
  msaPopulationMinimum: number | null;
  extractedAt: Date | string | null;
  needsReview: boolean;
  extractionNotes: string | null;
  tiers: CriteriaTier[];
}

interface ProductWithRelations {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
  category: string;
  criteria: Criteria | null;
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

                {(isAdmin || product.criteria) && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Underwriting Criteria (for AI Matching)
                      </p>
                      <div className="flex items-center gap-2">
                        {product.criteria?.needsReview && <Badge variant="destructive">Needs review</Badge>}
                        {isAdmin && productDocs.length > 0 && (
                          <ActionForm
                            action={reextractProductCriteria.bind(null, lenderId, product.id)}
                            successMessage="Re-extracted from the latest document"
                          >
                            <SubmitButton size="sm" variant="outline">
                              Re-extract from document
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </div>

                    {product.criteria?.extractedAt && (
                      <p className="mb-3 text-xs text-muted-foreground">
                        Last extracted {new Date(product.criteria.extractedAt).toLocaleDateString()} — correct
                        anything wrong below, or re-upload the document and re-extract.
                      </p>
                    )}

                    {isAdmin ? (
                      <ActionForm
                        action={updateLenderCriteria.bind(null, product.id)}
                        successMessage="Criteria saved"
                        className="space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label htmlFor={`minFico-${product.id}`}>Min FICO</Label>
                            <Input
                              id={`minFico-${product.id}`}
                              name="minFico"
                              type="number"
                              defaultValue={product.criteria?.minFico ?? ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`minLoanAmount-${product.id}`}>Min loan amount</Label>
                            <Input
                              id={`minLoanAmount-${product.id}`}
                              name="minLoanAmount"
                              type="number"
                              defaultValue={product.criteria?.minLoanAmount ?? ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`maxLoanAmount-${product.id}`}>Max loan amount</Label>
                            <Input
                              id={`maxLoanAmount-${product.id}`}
                              name="maxLoanAmount"
                              type="number"
                              defaultValue={product.criteria?.maxLoanAmount ?? ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`minDscr-${product.id}`}>Min DSCR</Label>
                            <Input
                              id={`minDscr-${product.id}`}
                              name="minDscr"
                              type="number"
                              step="0.01"
                              defaultValue={product.criteria?.minDscr ?? ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`maxLtv-${product.id}`}>Max LTV %</Label>
                            <Input
                              id={`maxLtv-${product.id}`}
                              name="maxLtv"
                              type="number"
                              step="0.1"
                              defaultValue={product.criteria?.maxLtv ?? ""}
                              placeholder={product.criteria?.tiers.length ? "Tiered — see below" : ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`maxLtc-${product.id}`}>Max LTC %</Label>
                            <Input
                              id={`maxLtc-${product.id}`}
                              name="maxLtc"
                              type="number"
                              step="0.1"
                              defaultValue={product.criteria?.maxLtc ?? ""}
                              placeholder={product.criteria?.tiers.length ? "Tiered — see below" : ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`maxLtarv-${product.id}`}>Max LTARV %</Label>
                            <Input
                              id={`maxLtarv-${product.id}`}
                              name="maxLtarv"
                              type="number"
                              step="0.1"
                              defaultValue={product.criteria?.maxLtarv ?? ""}
                              placeholder={product.criteria?.tiers.length ? "Tiered — see below" : ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`minExperienceCount-${product.id}`}>Min experience (deals)</Label>
                            <Input
                              id={`minExperienceCount-${product.id}`}
                              name="minExperienceCount"
                              type="number"
                              defaultValue={product.criteria?.minExperienceCount ?? ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`msaPopulationMinimum-${product.id}`}>Min MSA population</Label>
                            <Input
                              id={`msaPopulationMinimum-${product.id}`}
                              name="msaPopulationMinimum"
                              type="number"
                              defaultValue={product.criteria?.msaPopulationMinimum ?? ""}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`entityOnlyRequired-${product.id}`}>Entity only?</Label>
                            <Select
                              name="entityOnlyRequired"
                              defaultValue={
                                product.criteria?.entityOnlyRequired === true
                                  ? "yes"
                                  : product.criteria?.entityOnlyRequired === false
                                    ? "no"
                                    : "unstated"
                              }
                            >
                              <SelectTrigger id={`entityOnlyRequired-${product.id}`} className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unstated">Not stated</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`gcLicenseRequired-${product.id}`}>GC license required?</Label>
                            <Select
                              name="gcLicenseRequired"
                              defaultValue={
                                product.criteria?.gcLicenseRequired === true
                                  ? "yes"
                                  : product.criteria?.gcLicenseRequired === false
                                    ? "no"
                                    : "unstated"
                              }
                            >
                              <SelectTrigger id={`gcLicenseRequired-${product.id}`} className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unstated">Not stated</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`statesAllowed-${product.id}`}>Eligible states (comma-separated)</Label>
                            <Input
                              id={`statesAllowed-${product.id}`}
                              name="statesAllowed"
                              defaultValue={product.criteria?.statesAllowed?.join(", ") ?? ""}
                              placeholder="e.g. TX, FL, GA — blank if not restricted"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`propertyTypesAllowed-${product.id}`}>Eligible property types</Label>
                            <Input
                              id={`propertyTypesAllowed-${product.id}`}
                              name="propertyTypesAllowed"
                              defaultValue={product.criteria?.propertyTypesAllowed?.join(", ") ?? ""}
                              placeholder="e.g. Single Family, 2-4 Unit"
                            />
                          </div>
                        </div>

                        {product.criteria && product.criteria.tiers.length > 0 && (
                          <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                  <th className="p-2 text-left font-medium">FICO</th>
                                  <th className="p-2 text-left font-medium">Experience</th>
                                  <th className="p-2 text-left font-medium">Max LTC</th>
                                  <th className="p-2 text-left font-medium">Max LTARV</th>
                                  <th className="p-2 text-left font-medium">Max LTV</th>
                                  <th className="p-2 text-left font-medium">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.criteria.tiers.map((tier) => (
                                  <tr key={tier.id} className="border-t">
                                    <td className="p-2">
                                      {tier.ficoMin ?? "—"}
                                      {tier.ficoMax ? `–${tier.ficoMax}` : "+"}
                                    </td>
                                    <td className="p-2">{tier.experienceMin ?? "—"}</td>
                                    <td className="p-2">{tier.maxLtc ? `${tier.maxLtc}%` : "—"}</td>
                                    <td className="p-2">{tier.maxLtarv ? `${tier.maxLtarv}%` : "—"}</td>
                                    <td className="p-2">{tier.maxLtv ? `${tier.maxLtv}%` : "—"}</td>
                                    <td className="p-2 text-muted-foreground">{tier.notes ?? ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="border-t bg-muted/30 p-2 text-[11px] text-muted-foreground">
                              Tiered matrix — re-upload the document and re-extract to change these rows rather than
                              editing them by hand.
                            </p>
                          </div>
                        )}

                        {product.criteria?.extractionNotes && (
                          <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">AI notes: </span>
                            {product.criteria.extractionNotes}
                          </p>
                        )}

                        <div className="space-y-1.5">
                          <Label htmlFor={`otherNotes-${product.id}`}>Notes for AI matching</Label>
                          <Textarea
                            id={`otherNotes-${product.id}`}
                            name="otherNotes"
                            rows={2}
                            defaultValue={product.criteria?.otherNotes ?? ""}
                            placeholder="Anything worth calling out that isn't obvious from the uploaded documents"
                          />
                        </div>

                        <SubmitButton size="sm">Save</SubmitButton>
                      </ActionForm>
                    ) : (
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {product.criteria?.otherNotes && (
                          <p className="whitespace-pre-wrap">{product.criteria.otherNotes}</p>
                        )}
                        {product.criteria?.extractionNotes && <p>{product.criteria.extractionNotes}</p>}
                      </div>
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
