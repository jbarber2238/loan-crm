"use client";

import { useState } from "react";
import { requestPartnerSetupLink } from "@/server/actions/partner-portal";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BecomePartnerForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div role="status" className="space-y-2">
        <p className="text-lg" style={{ color: "#143D4A" }}>
          Check your inbox.
        </p>
        <p className="text-sm leading-relaxed">
          If that address can join, a setup link is on its way and should arrive within a minute. It takes about two minutes to
          finish. Nothing there? Check spam, or ask for another link.
        </p>
        <button type="button" onClick={() => setSent(false)} className="text-sm underline underline-offset-4">
          Use a different email
        </button>
      </div>
    );
  }
  return (
    <ActionForm action={requestPartnerSetupLink} onSuccess={() => setSent(true)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Your email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <SubmitButton className="w-full rounded-sm py-3 text-sm font-medium tracking-wide text-white hover:opacity-90" style={{ backgroundColor: "#143D4A" }}>
        Email me the setup link
      </SubmitButton>
    </ActionForm>
  );
}
