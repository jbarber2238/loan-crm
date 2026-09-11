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
} from "@/server/actions/lenders";
import { getAllProductOptions } from "@/server/actions/client-need-catalog";
import { deleteLenderDocument } from "@/server/actions/lender-documents";
import { AiMatrixUpload } from "@/components/lenders/ai-matrix-upload";
import { ProductsChecklist } from "@/components/lenders/products-checklist";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOAN_CATEGORIES } from "@/lib/labels";
import { formatFileSize } from "@/lib/format";

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
          criteria: true,
          clientNeeds: { with: { clientNeed: { with: { questions: true, categoryLinks: true } } } },
        },
      },
      documents: {
        columns: { id: true, lenderId: true, productId: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
      },
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
            <form action={updateLenderWithId} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={lender.name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} defaultValue={lender.notes ?? ""} />
              </div>
              <div className="flex items-center justify-between">
                <Button type="submit">Save</Button>
                <ConfirmSubmitButton
                  type="submit"
                  formAction={deleteLenderWithId}
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  confirmMessage={`Delete ${lender.name} and all its rep, products, and documents? This can't be undone.`}
                >
                  Delete lender
                </ConfirmSubmitButton>
              </div>
            </form>
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
              <form
                action={updateLenderRep.bind(null, lenderId, rep.id)}
                className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="rep-name">Name</Label>
                  <Input id="rep-name" name="name" defaultValue={rep.name} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-email">Email</Label>
                  <Input id="rep-email" name="email" defaultValue={rep.email} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rep-phone">Phone</Label>
                  <Input id="rep-phone" name="phone" defaultValue={rep.phone ?? ""} />
                </div>
                <Button type="submit" variant="secondary">
                  Save
                </Button>
                <Button type="submit" formAction={deleteLenderRep.bind(null, lenderId, rep.id)} variant="ghost">
                  Remove
                </Button>
              </form>
            ) : (
              <form action={addLenderRepWithId} className="grid grid-cols-1 gap-3 md:grid-cols-4 items-end">
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
                <Button type="submit">Add Rep</Button>
              </form>
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
                      <form action={deleteDoc}>
                        <Button type="submit" size="sm" variant="ghost">
                          Remove
                        </Button>
                      </form>
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
        </CardContent>
      </Card>
    </div>
  );
}
