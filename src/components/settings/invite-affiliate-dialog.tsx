"use client";

import { useState } from "react";
import { inviteAffiliate } from "@/server/actions/referral-affiliates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Controlled so it closes itself on a successful invite — see
// InviteMemberDialog for why an uncontrolled Dialog left open across a
// list-mutating Server Action revalidation caused a render crash.
export function InviteAffiliateDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">+ Invite Affiliate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Affiliate</DialogTitle>
        </DialogHeader>
        <ActionForm
          action={inviteAffiliate}
          successMessage="Invite sent"
          className="space-y-4"
          onSuccess={() => setOpen(false)}
        >
          <div className="space-y-1.5">
            <Label htmlFor="affiliate-email">Email</Label>
            <Input id="affiliate-email" name="email" type="email" required />
          </div>
          <SubmitButton className="w-full">Send Invite</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
