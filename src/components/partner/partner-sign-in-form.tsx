"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { partnerSignIn, requestPartnerSignInLink } from "@/server/actions/partner-portal";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PartnerSignInForm() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [linkSent, setLinkSent] = useState(false);

  function emailLink() {
    if (!email.trim()) {
      toast.error("Enter your email first.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", email);
      await requestPartnerSignInLink(formData);
      setLinkSent(true);
    });
  }

  return (
    <div className="space-y-4">
      <ActionForm action={partnerSignIn} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <SubmitButton className="w-full" style={{ backgroundColor: "#143D4A" }}>
          Sign in
        </SubmitButton>
      </ActionForm>
      <div className="border-t pt-4 text-sm">
        {linkSent ? (
          <p role="status">If that email is in our partner program, a sign-in link is on its way. It works once and expires in 15 minutes.</p>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="px-0 underline" disabled={pending} onClick={emailLink}>
            Forgot your password? Email me a sign-in link
          </Button>
        )}
      </div>
    </div>
  );
}
