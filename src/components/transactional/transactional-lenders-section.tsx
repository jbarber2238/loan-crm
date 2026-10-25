import {
  createTransactionalLender,
  deleteTransactionalLender,
  updateTransactionalLender,
} from "@/server/actions/transactional";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdditionalContactsEditor } from "@/components/transactional/additional-contacts-editor";
import type { LenderContact } from "@/lib/transactional-lender-contacts";

interface TransactionalLender {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  additionalContacts: LenderContact[];
  notes: string | null;
}

function LenderFields({ lender }: { lender?: TransactionalLender }) {
  const id = lender?.id ?? "new";
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`tl-name-${id}`}>Name</Label>
          <Input id={`tl-name-${id}`} name="name" defaultValue={lender?.name ?? ""} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tl-phone-${id}`}>Phone</Label>
          <Input id={`tl-phone-${id}`} name="phone" type="tel" defaultValue={lender?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tl-email-${id}`}>Email</Label>
          <Input id={`tl-email-${id}`} name="email" type="email" defaultValue={lender?.email ?? ""} />
        </div>
      </div>
      <AdditionalContactsEditor idPrefix={`tl-${id}`} initial={lender?.additionalContacts ?? []} />
      <div className="space-y-1.5">
        <Label htmlFor={`tl-notes-${id}`}>Notes — what they charge, etc.</Label>
        <Textarea id={`tl-notes-${id}`} name="notes" rows={3} defaultValue={lender?.notes ?? ""} />
      </div>
    </>
  );
}

/** Lenders who fund double closes. Just contact info and a note for now (pricing lives in the note). Admins edit; everyone else reads. */
export function TransactionalLendersSection({ isAdmin, lenders }: { isAdmin: boolean; lenders: TransactionalLender[] }) {
  return (
    <>
      <div data-intro-row className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          The lender(s) you send double-close funding requests to. New transactional requests are assigned to the first
          one automatically; you can change it on any request.
        </p>
        {isAdmin && (
          <Dialog>
            <DialogTrigger asChild>
              <Button>Add Transactional Lender</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add transactional lender</DialogTitle>
              </DialogHeader>
              <ActionForm action={createTransactionalLender} successMessage="Lender added" className="space-y-4">
                <LenderFields />
                <SubmitButton className="w-full">Add</SubmitButton>
              </ActionForm>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {lenders.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No transactional lenders yet.{isAdmin ? " Add your first one above." : ""}
          </CardContent>
        </Card>
      )}

      {lenders.map((lender) => (
        <Card key={lender.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{lender.name}</CardTitle>
            {isAdmin && (
              <ActionForm
                action={deleteTransactionalLender.bind(null, lender.id)}
                successMessage="Removed"
                confirmMessage={`Remove ${lender.name}? Requests assigned to them will be left without a lender.`}
              >
                <SubmitButton variant="destructive" size="sm">
                  Remove
                </SubmitButton>
              </ActionForm>
            )}
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <ActionForm action={updateTransactionalLender.bind(null, lender.id)} successMessage="Saved" className="space-y-3">
                <LenderFields lender={lender} />
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            ) : (
              <div className="space-y-1 text-sm">
                <p>{[lender.phone, lender.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                {lender.additionalContacts.map((c, i) => (
                  <p key={i} className="text-muted-foreground">
                    {[c.name, c.phone, c.email].filter(Boolean).join(" · ")}
                  </p>
                ))}
                {lender.notes && <p className="whitespace-pre-wrap text-muted-foreground">{lender.notes}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
