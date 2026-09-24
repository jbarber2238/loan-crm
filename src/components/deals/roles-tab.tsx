import {
  addDealFollower,
  removeDealFollower,
  updateDealRoles,
  updateTitleContact,
  updateInsuranceContact,
  updateInteriorAccessContact,
} from "@/server/actions/deals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeyContactCard } from "@/components/deals/key-contact-card";

interface UserOption {
  id: string;
  name: string | null;
}

interface Follower {
  id: string;
  name: string;
  email: string;
  roleLabel: string | null;
}

export function RolesTab({
  dealId,
  assignedLoanOfficerId,
  assignedProcessorId,
  assignedAssistantId,
  loanOfficers,
  processors,
  assistants,
  followers,
  titleCompanyAgentName,
  titleCompanyName,
  titleAgentEmail,
  titleAgentPhone,
  insuranceAgency,
  insuranceAgentName,
  insuranceAgentEmail,
  insuranceAgentPhone,
  insuranceContactNotes,
  interiorAccessContactRelationship,
  interiorAccessContactName,
  interiorAccessContactEmail,
  interiorAccessContactPhone,
  interiorAccessLockBoxInfo,
}: {
  dealId: string;
  assignedLoanOfficerId: string;
  assignedProcessorId: string | null;
  assignedAssistantId: string | null;
  loanOfficers: UserOption[];
  processors: UserOption[];
  assistants: UserOption[];
  followers: Follower[];
  titleCompanyAgentName: string | null;
  titleCompanyName: string | null;
  titleAgentEmail: string | null;
  titleAgentPhone: string | null;
  insuranceAgency: string | null;
  insuranceAgentName: string | null;
  insuranceAgentEmail: string | null;
  insuranceAgentPhone: string | null;
  insuranceContactNotes: string | null;
  interiorAccessContactRelationship: string | null;
  interiorAccessContactName: string | null;
  interiorAccessContactEmail: string | null;
  interiorAccessContactPhone: string | null;
  interiorAccessLockBoxInfo: string | null;
}) {
  const updateRoles = updateDealRoles.bind(null, dealId);
  const addFollower = addDealFollower.bind(null, dealId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assigned staff</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateRoles} successMessage="Roles saved" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="assignedLoanOfficerId">Loan officer</Label>
              <Select name="assignedLoanOfficerId" defaultValue={assignedLoanOfficerId} required>
                <SelectTrigger id="assignedLoanOfficerId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {loanOfficers.map((lo) => (
                    <SelectItem key={lo.id} value={lo.id}>
                      {lo.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedProcessorId">Processor</Label>
              <Select name="assignedProcessorId" defaultValue={assignedProcessorId ?? undefined}>
                <SelectTrigger id="assignedProcessorId" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {processors.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedAssistantId">Assistant</Label>
              <Select name="assignedAssistantId" defaultValue={assignedAssistantId ?? undefined}>
                <SelectTrigger id="assignedAssistantId" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Followers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Anyone who wants visibility into this deal without being the assigned LO, processor,
            or assistant — a referral loan officer, a capital partner, etc. Daily client-need
            reminder emails are coming in a later pass; everyone listed here will be included on
            those once that ships.
          </p>

          <ul className="space-y-2">
            {followers.map((f) => {
              const remove = removeDealFollower.bind(null, dealId, f.id);
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {f.name} {f.roleLabel && <Badge variant="secondary">{f.roleLabel}</Badge>}
                    </p>
                    <p className="text-muted-foreground">{f.email}</p>
                  </div>
                  <ActionForm action={remove} successMessage="Follower removed">
                    <SubmitButton size="sm" variant="ghost">
                      Remove
                    </SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
            {followers.length === 0 && (
              <p className="text-sm text-muted-foreground">No followers added yet.</p>
            )}
          </ul>

          <ActionForm
            action={addFollower}
            successMessage="Follower added"
            confirmMessage="You're adding someone from outside your organization. They will receive all client need emails. Are you sure you want to add them?"
            className="grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-[1fr_1fr_1fr_auto] items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roleLabel">Label (optional)</Label>
              <Input id="roleLabel" name="roleLabel" placeholder="Referral LO, Capital Partner..." />
            </div>
            <SubmitButton>Add follower</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <KeyContactCard
          title="Insurance Information"
          dealId={dealId}
          saveAction={updateInsuranceContact}
          contactType="Insurance"
          fields={[
            { name: "insuranceAgency", label: "Insurance Agency", value: insuranceAgency },
            { name: "insuranceAgentName", label: "Agent Name", value: insuranceAgentName },
            { name: "insuranceAgentEmail", label: "Agent Email", value: insuranceAgentEmail },
            { name: "insuranceAgentPhone", label: "Agent Phone Number", value: insuranceAgentPhone },
            { name: "insuranceContactNotes", label: "Notes", value: insuranceContactNotes },
          ]}
        />
        <KeyContactCard
          title="Title Information"
          dealId={dealId}
          saveAction={updateTitleContact}
          contactType="Title"
          fields={[
            { name: "titleCompanyName", label: "Title Company Name", value: titleCompanyName },
            { name: "titleCompanyAgentName", label: "Title Agent Name", value: titleCompanyAgentName },
            { name: "titleAgentEmail", label: "Title Agent Email", value: titleAgentEmail },
            { name: "titleAgentPhone", label: "Title Agent Phone Number", value: titleAgentPhone },
          ]}
        />
        <KeyContactCard
          title="Interior Access"
          dealId={dealId}
          saveAction={updateInteriorAccessContact}
          contactType="Other"
          fields={[
            {
              name: "interiorAccessContactRelationship",
              label: "Relationship",
              value: interiorAccessContactRelationship,
            },
            { name: "interiorAccessContactName", label: "Contact Name", value: interiorAccessContactName },
            { name: "interiorAccessContactEmail", label: "Contact Email", value: interiorAccessContactEmail },
            { name: "interiorAccessContactPhone", label: "Contact Phone", value: interiorAccessContactPhone },
            { name: "interiorAccessLockBoxInfo", label: "Lock Box Info", value: interiorAccessLockBoxInfo },
          ]}
        />
      </div>
    </div>
  );
}
