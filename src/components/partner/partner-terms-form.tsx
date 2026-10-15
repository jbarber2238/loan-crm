"use client";

import { acceptPartnerTerms } from "@/server/actions/partner-portal";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

export function PartnerTermsForm() {
  return (
    <ActionForm action={acceptPartnerTerms} className="space-y-4">
      <label className="flex items-start gap-2 text-sm font-medium">
        <input type="checkbox" name="accept" required className="mt-0.5 size-4 shrink-0" />
        <span>I have read and agree to these terms.</span>
      </label>
      <SubmitButton className="w-full" style={{ backgroundColor: "#143D4A" }}>
        Accept and continue
      </SubmitButton>
    </ActionForm>
  );
}
