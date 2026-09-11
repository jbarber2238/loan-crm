import {
  addDealFollower,
  removeDealFollower,
  updateDealRoles,
  updateTitleContact,
  updateInsuranceContact,
} from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  titleAgentEmail,
  titleAgentPhone,
  insuranceAgency,
  insuranceAgentName,
  insuranceAgentEmail,
  insuranceAgentPhone,
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
  titleAgentEmail: string | null;
  titleAgentPhone: string | null;
  insuranceAgency: string | null;
  insuranceAgentName: string | null;
  insuranceAgentEmail: string | null;
  insuranceAgentPhone: string | null;
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
          <form action={updateRoles} className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              <Button type="submit">Save</Button>
            </div>
          </form>
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
                  <form action={remove}>
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                    </Button>
                  </form>
                </li>
              );
            })}
            {followers.length === 0 && (
              <p className="text-sm text-muted-foreground">No followers added yet.</p>
            )}
          </ul>

          <form
            action={addFollower}
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
            <Button type="submit">Add follower</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <KeyContactCard
          title="Insurance Information"
          dealId={dealId}
          saveAction={updateInsuranceContact}
          fields={[
            { name: "insuranceAgency", label: "Insurance Agency", value: insuranceAgency },
            { name: "insuranceAgentName", label: "Agent Name", value: insuranceAgentName },
            { name: "insuranceAgentEmail", label: "Agent Email", value: insuranceAgentEmail },
            { name: "insuranceAgentPhone", label: "Agent Phone Number", value: insuranceAgentPhone },
          ]}
        />
        <KeyContactCard
          title="Title Information"
          dealId={dealId}
          saveAction={updateTitleContact}
          fields={[
            { name: "titleCompanyAgentName", label: "Title Company / Agent Name", value: titleCompanyAgentName },
            { name: "titleAgentEmail", label: "Title Agent Email", value: titleAgentEmail },
            { name: "titleAgentPhone", label: "Title Agent Phone Number", value: titleAgentPhone },
          ]}
        />
      </div>
    </div>
  );
}
