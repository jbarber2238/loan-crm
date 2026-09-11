import {
  acceptTermSheet,
  generateTermSheet,
  sendBookACallEmail,
  sendTermSheetsToBorrower,
  updateTermSheetFields,
} from "@/server/actions/term-sheets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NewTermSheetForm } from "@/components/deals/new-term-sheet-form";
import { TermSheetFieldInputs } from "@/components/deals/term-sheet-field-inputs";
import { ADMIN_ONLY_FIELDS, termSheetFieldsFor } from "@/lib/term-sheet-fields";

interface TermSheet {
  id: string;
  status: "draft" | "generated" | "accepted";
  fields: Record<string, unknown>;
  pdfUrl: string | null;
  createdAt: Date;
  lender: { name: string };
  product: { name: string; category: string };
}

interface ProductOption {
  id: string;
  name: string;
  category: string;
  lenderName: string;
}

export function TermSheetsTab({
  dealId,
  termSheets,
  products,
  isAdmin,
  hasBorrowerEmail,
}: {
  dealId: string;
  termSheets: TermSheet[];
  products: ProductOption[];
  isAdmin: boolean;
  hasBorrowerEmail: boolean;
}) {
  const sendToBorrower = sendTermSheetsToBorrower.bind(null, dealId);
  const bookACall = sendBookACallEmail.bind(null, dealId);
  const shareable = termSheets.filter((t) => t.status !== "draft");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Send to borrower</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send term sheets to borrower</DialogTitle>
            </DialogHeader>
            {!hasBorrowerEmail ? (
              <p className="text-sm text-muted-foreground">
                Add a borrower email on the Overview tab first.
              </p>
            ) : (
              <div className="space-y-4">
                <form action={sendToBorrower} className="space-y-3">
                  {shareable.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox name="termSheetIds" value={t.id} defaultChecked />
                      {t.lender.name} — {t.product.name}
                    </label>
                  ))}
                  {shareable.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Generate a term sheet first.
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={shareable.length === 0}>
                    Send directly
                  </Button>
                </form>
                <form action={bookACall}>
                  <Button type="submit" variant="secondary" className="w-full">
                    Send &ldquo;book a call&rdquo; email instead
                  </Button>
                </form>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button>New Term Sheet</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Term Sheet</DialogTitle>
            </DialogHeader>
            <NewTermSheetForm dealId={dealId} products={products} isAdmin={isAdmin} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {termSheets.map((termSheet) => {
          const generate = generateTermSheet.bind(null, dealId, termSheet.id);
          const accept = acceptTermSheet.bind(null, dealId, termSheet.id);
          const updateFields = updateTermSheetFields.bind(null, dealId, termSheet.id);
          const fieldDefs = [
            ...termSheetFieldsFor(termSheet.product.category),
            ...(isAdmin ? ADMIN_ONLY_FIELDS : []),
          ];

          return (
            <Card key={termSheet.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {termSheet.lender.name} — {termSheet.product.name}
                </CardTitle>
                <Badge
                  variant={
                    termSheet.status === "accepted"
                      ? "default"
                      : termSheet.status === "generated"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {termSheet.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Edit fields
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit term sheet fields</DialogTitle>
                    </DialogHeader>
                    <form action={updateFields} className="space-y-4">
                      <TermSheetFieldInputs fields={fieldDefs} values={termSheet.fields} />
                      <Button type="submit" className="w-full">
                        Save
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                {termSheet.status === "draft" && (
                  <form action={generate}>
                    <Button type="submit" size="sm">
                      Generate PDF
                    </Button>
                  </form>
                )}

                {termSheet.pdfUrl && (
                  <a href={termSheet.pdfUrl} target="_blank" rel="noreferrer">
                    <Button type="button" variant="secondary" size="sm">
                      View PDF
                    </Button>
                  </a>
                )}

                {termSheet.status !== "accepted" && termSheet.status !== "draft" && (
                  <form action={accept}>
                    <Button type="submit" size="sm" variant="default">
                      Accept
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
        {termSheets.length === 0 && (
          <p className="text-sm text-muted-foreground">No term sheets yet.</p>
        )}
      </div>
    </div>
  );
}
