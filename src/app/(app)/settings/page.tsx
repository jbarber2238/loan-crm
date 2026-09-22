import { requireUser } from "@/server/auth/guards";
import { updateMyProfile } from "@/server/actions/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASE_ROLES, labelFor } from "@/lib/labels";
import { EmailSignatureEditor } from "@/components/settings/email-signature-editor";
import { BorrowerIntroEditor } from "@/components/settings/borrower-intro-editor";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

export default async function MyProfilePage() {
  const user = await requireUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
            <AvatarFallback className="text-lg">{user.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex gap-1.5">
              <Badge variant="secondary">{labelFor(BASE_ROLES, user.baseRole)}</Badge>
              {user.isAdmin && <Badge>Admin</Badge>}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Your photo comes from your Google account. Contact an admin to change your role.
        </p>

        <ActionForm action={updateMyProfile} successMessage="Name saved" className="space-y-1.5 border-t pt-4 max-w-sm">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={user.name ?? ""} />
          <SubmitButton>Save</SubmitButton>
        </ActionForm>

        {user.baseRole === "loan_officer" && (
          <ActionForm
            action={updateMyProfile}
            successMessage="Scheduling link saved"
            className="space-y-1.5 border-t pt-4 max-w-sm"
          >
            <Label htmlFor="schedulingLink">Scheduling link (Calendly, etc.)</Label>
            <Input
              id="schedulingLink"
              name="schedulingLink"
              defaultValue={user.schedulingLink ?? ""}
              placeholder="https://calendly.com/you"
            />
            <p className="text-xs text-muted-foreground pb-2">
              Used for the &ldquo;book a call&rdquo; email when sending term sheets to borrowers.
            </p>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}

        {user.baseRole === "loan_officer" && (
          <ActionForm
            action={updateMyProfile}
            successMessage="Loan originator info saved"
            className="space-y-3 border-t pt-4 max-w-sm"
          >
            <div className="space-y-1.5">
              <Label htmlFor="nmlsNumber">NMLS #</Label>
              <Input id="nmlsNumber" name="nmlsNumber" defaultValue={user.nmlsNumber ?? ""} placeholder="Not yet licensed" />
            </div>
            <p className="text-xs text-muted-foreground pb-2">
              Shown in the Loan Originator Information section on generated term sheets, alongside your name and
              email.
            </p>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}

        <ActionForm action={updateMyProfile} successMessage="Phone saved" className="space-y-1.5 border-t pt-4 max-w-sm">
          <Label htmlFor="phone">Your phone number</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} placeholder="(555) 555-5555" />
          <p className="text-xs text-muted-foreground pb-2">
            Used for click-to-call — when you call a borrower from a deal, this is the number that rings first,
            before you're bridged to them. Also shown on term sheets if you&apos;re a loan officer.
          </p>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>

        <ActionForm action={updateMyProfile} successMessage="Hours saved" className="space-y-4 border-t pt-4 max-w-sm">
          <div>
            <Label className="mb-1.5 block">Inbound hours</Label>
            <p className="text-xs text-muted-foreground mb-2">
              When a borrower's call should ring your phone. Purely your own preference — leave blank for no
              restriction (always reachable).
            </p>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Inbound hours start"
                name="inboundHoursStart"
                type="time"
                defaultValue={user.inboundHoursStart?.slice(0, 5) ?? ""}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                aria-label="Inbound hours end"
                name="inboundHoursEnd"
                type="time"
                defaultValue={user.inboundHoursEnd?.slice(0, 5) ?? ""}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Outbound hours</Label>
            <p className="text-xs text-muted-foreground mb-2">
              When you can call/text a borrower from the app. Capped to the company&apos;s TCPA-safe window
              regardless of what you set here — this can only narrow it, not widen it.
            </p>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Outbound hours start"
                name="outboundHoursStart"
                type="time"
                defaultValue={user.outboundHoursStart?.slice(0, 5) ?? ""}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                aria-label="Outbound hours end"
                name="outboundHoursEnd"
                type="time"
                defaultValue={user.outboundHoursEnd?.slice(0, 5) ?? ""}
              />
            </div>
          </div>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>

        <ActionForm action={updateMyProfile} successMessage="Signature saved" className="space-y-1.5 border-t pt-4">
          <Label>Email signature</Label>
          <EmailSignatureEditor name="emailSignatureHtml" defaultValueHtml={user.emailSignatureHtml ?? ""} />
          <p className="text-xs text-muted-foreground pb-2">
            Appended to every email you send from the CRM — pricing requests, borrower updates, term
            sheets. Paste in a signature from Gmail or anywhere else and its formatting carries over.
          </p>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>

        {user.baseRole === "processor" && (
          <ActionForm
            action={updateMyProfile}
            successMessage="Intro templates saved"
            className="space-y-1.5 border-t pt-4 max-w-lg"
          >
            <BorrowerIntroEditor
              defaultSubject={user.borrowerIntroEmailSubject ?? ""}
              defaultEmailBody={user.borrowerIntroEmailBody ?? ""}
              defaultTextBody={user.borrowerIntroTextBody ?? ""}
            />
            <p className="text-xs text-muted-foreground pb-2">
              Used by the &ldquo;Send Intro Email&rdquo;/&ldquo;Send Intro Text&rdquo; buttons on a deal — set
              these up once, then send your own introduction to a borrower in a click.
            </p>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
