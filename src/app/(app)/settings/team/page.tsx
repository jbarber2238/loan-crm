import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { inviteUser, updateUser, deleteUser } from "@/server/actions/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BASE_ROLES } from "@/lib/labels";
import { CopyIntakeLinkButton } from "@/components/deals/copy-intake-link-button";
import { CopyEmbedCodeButton } from "@/components/deals/copy-embed-code-button";

export default async function TeamSettingsPage() {
  const admin = await requireAdmin();

  const allUsers = await db.query.users.findMany({
    orderBy: (users, { asc }) => asc(users.name),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Invite someone by email to set their role before they ever sign in — once they
          sign in with that Google account, it links to the invite automatically. Team
          members who sign in first without an invite show up here too, defaulted to
          Loan Officer.
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="shrink-0">+ Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
            </DialogHeader>
            <ActionForm action={inviteUser} successMessage="Invite sent" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select name="baseRole" defaultValue="loan_officer">
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="isAdmin" />
                Admin
              </label>
              <SubmitButton className="w-full">Send Invite</SubmitButton>
            </ActionForm>
          </DialogContent>
        </Dialog>
      </div>

      {allUsers.map((user) => {
        const action = updateUser.bind(null, user.id);
        const pending = !user.name;
        return (
          <Card key={user.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                {pending ? (
                  <>
                    {user.email}
                    <Badge variant="secondary">Invited — hasn&apos;t signed in yet</Badge>
                  </>
                ) : (
                  <>
                    {user.name} <span className="text-muted-foreground font-normal">— {user.email}</span>
                  </>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {user.baseRole === "loan_officer" && (
                  <>
                    <CopyIntakeLinkButton loanOfficerId={user.id} />
                    <CopyEmbedCodeButton loanOfficerId={user.id} />
                  </>
                )}
                {user.id !== admin.id && (
                  <ActionForm
                    action={deleteUser.bind(null, user.id)}
                    successMessage="Removed"
                    confirmMessage={
                      pending
                        ? `Withdraw the invite for ${user.email}?`
                        : `Remove ${user.name} from the team? This can't be undone — if they have any deals or records, removal will be blocked and you'll need to deactivate them instead.`
                    }
                  >
                    <SubmitButton variant="destructive" size="sm">
                      {pending ? "Withdraw invite" : "Remove"}
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ActionForm action={action} successMessage="Saved" className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`role-${user.id}`}>Role</Label>
                    <Select name="baseRole" defaultValue={user.baseRole}>
                      <SelectTrigger id={`role-${user.id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BASE_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`scheduling-${user.id}`}>Scheduling link (Calendly, etc.)</Label>
                    <Input
                      id={`scheduling-${user.id}`}
                      name="schedulingLink"
                      defaultValue={user.schedulingLink ?? ""}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="isAdmin" defaultChecked={user.isAdmin} />
                    Admin
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="active" defaultChecked={user.active} />
                    Active
                  </label>
                </div>

                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
