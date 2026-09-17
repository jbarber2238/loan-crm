import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { lenderDocuments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { createLender } from "@/server/actions/lenders";
import {
  deleteLenderDocument,
  deleteMasterDocument,
  uploadLenderMatrixDocument,
  uploadMasterDocument,
} from "@/server/actions/lender-documents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/format";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

export default async function LendersPage() {
  const user = await requireUser();
  const [allLenders, masterDocs] = await Promise.all([
    db.query.lenders.findMany({
      with: {
        products: true,
        reps: true,
        documents: {
          // Every document tied to this lender, whether it's a lender-wide
          // guideline (no product) or a specific product's own matrix —
          // matrices are inherently product-specific, so filtering those
          // out here made real uploads look like they'd vanished.
          columns: { id: true, lenderId: true, productId: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
          with: { product: { columns: { name: true } } },
        },
      },
      orderBy: (lenders, { asc }) => asc(lenders.name),
    }),
    db.query.lenderDocuments.findMany({
      where: isNull(lenderDocuments.lenderId),
      columns: { id: true, lenderId: true, productId: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
      orderBy: (docs, { desc }) => desc(docs.createdAt),
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Lenders</h1>

      <Tabs defaultValue="lenders">
        <TabsList>
          <TabsTrigger value="lenders">Lenders</TabsTrigger>
          <TabsTrigger value="matrices">Lender Matrices</TabsTrigger>
        </TabsList>

        <TabsContent value="lenders" className="space-y-4">
          <div className="flex items-center justify-end">
            {user.isAdmin && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Add Lender</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Lender</DialogTitle>
                  </DialogHeader>
                  <ActionForm action={createLender} successMessage="Lender created" className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" name="name" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea id="notes" name="notes" rows={3} />
                    </div>
                    <SubmitButton className="w-full">Create</SubmitButton>
                  </ActionForm>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="space-y-3">
            {allLenders.map((lender) => (
              <Link key={lender.id} href={`/lenders/${lender.id}`}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{lender.name}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {lender.products.length} product
                        {lender.products.length === 1 ? "" : "s"} ·{" "}
                        {lender.reps.length} rep{lender.reps.length === 1 ? "" : "s"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            ))}
            {allLenders.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No lenders yet. Add your first one above.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="matrices" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Master lender matrix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your own reference spreadsheet covering every lender and product
                at a glance. The AI lender-matching check reads this alongside
                each lender&apos;s specific matrix below.
              </p>
              <div className="space-y-1">
                {masterDocs.map((doc) => {
                  const deleteDoc = deleteMasterDocument.bind(null, doc.id);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
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
                {masterDocs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No master matrix uploaded yet.</p>
                )}
              </div>
              {user.isAdmin && (
                <ActionForm
                  action={uploadMasterDocument}
                  successMessage="Document uploaded"
                  className="flex items-end gap-3 border-t pt-4"
                >
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="master-file">Upload a new version (remove the old one below when ready)</Label>
                    <Input id="master-file" name="file" type="file" multiple required />
                  </div>
                  <SubmitButton>Upload</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lender-Specific Guidelines and Matrices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Every lender&apos;s own rate matrix or guideline sheets, all in one place.
              </p>

              {user.isAdmin && (
                <ActionForm
                  action={uploadLenderMatrixDocument}
                  successMessage="Document uploaded"
                  className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] items-end border-b pb-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="lenderId">Lender</Label>
                    <Select name="lenderId" required>
                      <SelectTrigger id="lenderId" className="w-full">
                        <SelectValue placeholder="Select a lender" />
                      </SelectTrigger>
                      <SelectContent>
                        {allLenders.map((lender) => (
                          <SelectItem key={lender.id} value={lender.id}>
                            {lender.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="matrix-file">File</Label>
                    <Input id="matrix-file" name="file" type="file" multiple required />
                  </div>
                  <SubmitButton>Upload</SubmitButton>
                </ActionForm>
              )}

              <div className="space-y-2">
                {allLenders.map((lender) => (
                  <details key={lender.id} className="group rounded-md border">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                      <span>{lender.name}</span>
                      <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                        {lender.documents.length} file{lender.documents.length === 1 ? "" : "s"}
                        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="space-y-1 border-t p-2">
                      {lender.documents.map((doc) => {
                        const deleteDoc = deleteLenderDocument.bind(null, lender.id, doc.id);
                        return (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          >
                            <a
                              href={`/api/lender-documents/${doc.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              {doc.fileName}
                              {doc.product && (
                                <span className="ml-1.5 text-xs text-muted-foreground">— {doc.product.name}</span>
                              )}
                            </a>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(doc.fileSize)}
                              </span>
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
                      {lender.documents.length === 0 && (
                        <p className="px-1 py-1 text-sm text-muted-foreground">No matrix uploaded yet.</p>
                      )}
                    </div>
                  </details>
                ))}
                {allLenders.length === 0 && (
                  <p className="text-sm text-muted-foreground">No lenders yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
