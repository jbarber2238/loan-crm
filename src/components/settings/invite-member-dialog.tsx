"use client";

import { useState } from "react";
import { inviteUser } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BASE_ROLES } from "@/lib/labels";

// Controlled (rather than the plain uncontrolled Dialog+DialogTrigger this
// used to be) so the dialog can close itself once the invite actually
// succeeds — leaving it open while the team list re-renders behind it
// (a brand-new row appearing via revalidatePath) is what was producing an
// intermittent render crash in production.
export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">+ Invite Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
        </DialogHeader>
        <ActionForm
          action={inviteUser}
          successMessage="Invite sent"
          className="space-y-4"
          onSuccess={() => setOpen(false)}
        >
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
  );
}
