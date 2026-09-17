import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { lenders, products } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import {
  addLenderRep,
  deleteLender,
  deleteLenderRep,
  updateLender,
  updateLenderRep,
  updateLenderWideCriteria,
} from "@/server/actions/lenders";
import { getAllProductOptions } from "@/server/actions/client-need-catalog";
import { deleteLenderDocument, reextractLenderWideCriteria } from "@/server/actions/lender-documents";
import { AiMatrixUpload } from "@/components/lenders/ai-matrix-upload";
import { ProductsChecklist } from "@/components/lenders/products-checklist";
import { LenderSubmissionSection } from "@/components/lenders/lender-submission-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOAN_CATEGORIES } from "@/lib/labels";
import { formatFileSize } from "@/lib/format";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

export default async function LenderDetailPage({
  params,
}: {
  params: Promise<{ lenderId: string }>;
}) {
  const user = await requireUser();
  const { lenderId } = await params;

  const lender = await db.query.lenders.findFirst({
    where: eq(lenders.id, lenderId),
    with: {
      reps: true,
      products: {
        with: {
          criteria: { with: { tiers: true } },
          clientNeeds: { with: { clientNeed: { with: { questions: true, categoryLinks: true } } } },
        },
      },
      documents: {
        columns: { id: true, lenderId: true, productId: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
      },
      wideCriteria: true,
    },
  });

  if (!lender) notFound();

  const [otherProducts, fullCatalog, allProductOptions] = await Promise.all([
    db.query.products.findMany({
      where: ne(products.lenderId, lenderId),
      with: { lender: true },
      orderBy: (p, { asc }) => asc(p.name),
    }),
    db.query.clientNeeds.findMany({
      columns: { id: true, itemName: true, needType: true, isCustom: true },
      orderBy: (cn, { asc }) => asc(cn.itemName),
    }),
    getAllProductOptions(),
  ]);

  const usedCategories = new Set(lender.products.map((p) => p.category));
  const availableCategories = LOAN_CATEGORIES.filter((cat) => !usedCategories.has(cat.value));
  const generalDocs = lender.documents.filter((d) => !d.productId);
  const rep = lender.reps[0] ?? null;
  const canEditClientNeeds = user.isAdmin || user.baseRole === "processor";

  const updateLenderWithId = updateLender.bind(null, lenderId);
  const addLenderRepWithId = addLenderRep.bind(null, lenderId);
  const deleteLenderWithId = deleteLender.bind(null, lenderId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/lenders" className="text-sm text-muted-foreground hover:underline">
          ← Lenders
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lender</CardTitle>
        </CardHeader>
        <CardContent>
          {user.isAdmin ? (
            // Two sibling forms, not one form nested in another (invalid HTML) —
            // Save owns the name/notes fields; Delete needs no fields at all.
            <div className="space-y-3">
              <ActionForm action={updateLenderWithId} successMessage="Lender saved" className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={lender.name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={3} defaultValue={lender.notes ?? ""} />
                </div>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
              <div className="flex justify-end">
                <ActionForm
                  action={deleteLenderWithId}
                  successMessage="Lender deleted"
                  confirmMessage={`Delete ${lender.name} and all its rep, products, and documents? This can't be undone.`}
                >
                  <SubmitButton variant="ghost" className="text-destructive hover:text-destructive">
                    Delete lender
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{lender.name}</p>
              {lender.notes && <p className="text-muted-foreground whitespace-pre-wrap">{lender.notes}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rep</CardTitle>
        </CardHeader>
        <CardContent>
          {user.isAdmin ? (
            rep ? (
              // Two sibling forms — Save owns the name/email/phone fields, Remove needs none.
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
                <ActionForm
                  action={updateLenderRep.bind(null, lenderId, rep.id)}
                  successMessage="Rep saved"
                  className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="rep-name">Name</Label>
                    <Input id="rep-name" name="name" defaultValue={rep.name} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rep-email">Email</Label>
                    <Input id="rep-email" name="email" defaultValue={rep.email} />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="rep-phone">Phone</Label>
                      <Input id="rep-phone" name="phone" defaultValue={rep.phone ?? ""} />
                    </div>
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </div>
                </ActionForm>
                <ActionForm action={deleteLenderRep.bind(null, lenderId, rep.id)} successMessage="Rep removed">
                  <SubmitButton variant="ghost">Remove</SubmitButton>
                </ActionForm>
              </div>
            ) : (
              <ActionForm
                action={addLenderRepWithId}
                successMessage="Rep added"
                className="grid grid-cols-1 gap-3 md:grid-cols-4 items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="new-rep-name">Name</Label>
                  <Input id="new-rep-name" name="name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-rep-email">Email</Label>
                  <Input id="new-rep-email" name="email" type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-rep-phone">Phone</Label>
                  <Input id="new-rep-phone" name="phone" />
                </div>
                <SubmitButton>Add Rep</SubmitButton>
              </ActionForm>
            )
          ) : rep ? (
            <div className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{rep.name}</p>
              <p className="text-muted-foreground">
                {rep.email}
                {rep.phone && ` · ${rep.phone}`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rep on file.</p>
          )}
        </CardContent>
      </Card>

      {(user.isAdmin || user.baseRole === "processor") && (
        <LenderSubmissionSection
          lenderId={lenderId}
          quickPricerUrl={lender.quickPricerUrl}
          applicationSubmissionMethod={lender.applicationSubmissionMethod}
          brokerPortalUrl={lender.brokerPortalUrl}
          introEmailSubject={lender.introEmailSubject}
          introEmailBody={lender.introEmailBody}
        />
      )}

      <ProductsChecklist
        lenderId={lenderId}
        products={lender.products}
        lenderDocuments={lender.documents}
        fullCatalog={fullCatalog}
        otherProducts={otherProducts}
        allProductOptions={allProductOptions}
        availableCategories={availableCategories}
        isAdmin={user.isAdmin}
        canEditClientNeeds={canEditClientNeeds}
      />

      <Card>
        <CardHeader>
          <CardTitle>Matrix and Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {user.isAdmin
              ? "General documents that don't belong to one specific product (a company overview, wiring instructions, etc). Category-specific matrices belong under their product above — the AI uploader below sorts that out for you."
              : "General reference documents for this lender."}
          </p>

          <div className="space-y-1">
            {generalDocs.map((doc) => {
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
                    {user.isAdmin && (
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
            {generalDocs.length === 0 && (
              <p className="text-sm text-muted-foreground">No general documents yet.</p>
            )}
          </div>

          {user.isAdmin && <AiMatrixUpload lenderId={lenderId} />}

          {(user.isAdmin || lender.wideCriteria) && (
            <div className="border-t pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cross-Program Eligibility (for AI Matching)
                </p>
                <div className="flex items-center gap-2">
                  {lender.wideCriteria?.needsReview && <Badge variant="destructive">Needs review</Badge>}
                  {user.isAdmin && generalDocs.length > 0 && (
                    <ActionForm
                      action={reextractLenderWideCriteria.bind(null, lenderId)}
                      successMessage="Re-extracted from the latest general document"
                    >
                      <SubmitButton size="sm" variant="outline">
                        Re-extract from document
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </div>

              {lender.wideCriteria?.extractedAt && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Last extracted {new Date(lender.wideCriteria.extractedAt).toLocaleDateString()} — quick yes/no
                  facts that apply across every {lender.name} product, pulled from a general document above (a
                  foreign-national matrix, an overlay guideline, etc).
                </p>
              )}

              {user.isAdmin ? (
                <ActionForm
                  action={updateLenderWideCriteria.bind(null, lenderId)}
                  successMessage="Eligibility saved"
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="foreignNationalEligible">Foreign national eligible?</Label>
                      <Select
                        name="foreignNationalEligible"
                        defaultValue={
                          lender.wideCriteria?.foreignNationalEligible === true
                            ? "yes"
                            : lender.wideCriteria?.foreignNationalEligible === false
                              ? "no"
                              : "unstated"
                        }
                      >
                        <SelectTrigger id="foreignNationalEligible" className="w-full">
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
                      <Label htmlFor="itinEligible">ITIN borrower eligible?</Label>
                      <Select
                        name="itinEligible"
                        defaultValue={
                          lender.wideCriteria?.itinEligible === true
                            ? "yes"
                            : lender.wideCriteria?.itinEligible === false
                              ? "no"
                              : "unstated"
                        }
                      >
                        <SelectTrigger id="itinEligible" className="w-full">
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
                      <Label htmlFor="ruralEligible">Rural property eligible?</Label>
                      <Select
                        name="ruralEligible"
                        defaultValue={
                          lender.wideCriteria?.ruralEligible === true
                            ? "yes"
                            : lender.wideCriteria?.ruralEligible === false
                              ? "no"
                              : "unstated"
                        }
                      >
                        <SelectTrigger id="ruralEligible" className="w-full">
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

                  {lender.wideCriteria?.extractionNotes && (
                    <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">AI notes: </span>
                      {lender.wideCriteria.extractionNotes}
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="wideOtherNotes">Notes for AI matching</Label>
                    <Textarea
                      id="wideOtherNotes"
                      name="otherNotes"
                      rows={2}
                      defaultValue={lender.wideCriteria?.otherNotes ?? ""}
                      placeholder="Anything worth calling out that isn't obvious from the uploaded documents"
                    />
                  </div>

                  <SubmitButton size="sm">Save</SubmitButton>
                </ActionForm>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  {lender.wideCriteria?.otherNotes && (
                    <p className="whitespace-pre-wrap">{lender.wideCriteria.otherNotes}</p>
                  )}
                  {lender.wideCriteria?.extractionNotes && <p>{lender.wideCriteria.extractionNotes}</p>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
