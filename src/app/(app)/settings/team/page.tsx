import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { inviteUser, updateUser } from "@/server/actions/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export default async function TeamSettingsPage() {
  await requireAdmin();

  const allUsers = await db.query.users.findMany({
    orderBy: (users, { asc }) => asc(users.name),
  });
  const loanOfficers = allUsers.filter((u) => u.baseRole === "loan_officer");

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
            <form action={inviteUser} className="space-y-4">
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
              <Button type="submit" className="w-full">
                Send Invite
              </Button>
            </form>
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
              {user.baseRole === "loan_officer" && (
                <CopyIntakeLinkButton loanOfficerId={user.id} />
              )}
            </CardHeader>
            <CardContent>
              <form action={action} className="space-y-4">
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

                <div className="space-y-1.5">
                  <Label htmlFor={`assigned-${user.id}`}>
                    Supports loan officers (assistants only — Cmd/Ctrl-click to select multiple)
                  </Label>
                  <select
                    id={`assigned-${user.id}`}
                    name="assignedLoanOfficerIds"
                    multiple
                    className="w-full rounded-md border bg-transparent p-2 text-sm"
                    defaultValue={user.assignedLoanOfficerIds ?? []}
                  >
                    {loanOfficers.map((lo) => (
                      <option key={lo.id} value={lo.id}>
                        {lo.name ?? lo.email}
                      </option>
                    ))}
                  </select>
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

                <Button type="submit">Save</Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
