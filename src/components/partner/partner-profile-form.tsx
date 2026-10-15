"use client";

import { completePartnerProfile } from "@/server/actions/partner-portal";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MIN_PASSWORD_LENGTH, PARTNER_TYPES } from "@/lib/partner-constants";

function Field({ id, label, type = "text", defaultValue, hint }: { id: string; label: string; type?: string; defaultValue?: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        <span className="text-destructive" aria-hidden="true">
          {" "}
          *
        </span>
      </Label>
      <Input id={id} name={id} type={type} required defaultValue={defaultValue} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PartnerProfileForm({ token, name, email }: { token: string; name: string | null; email: string }) {
  return (
    <ActionForm action={completePartnerProfile.bind(null, token)} className="space-y-5">
      <p className="text-sm" style={{ color: "#68735F" }}>
        Setting up <strong>{email}</strong>
      </p>
      <Field id="name" label="Your name" defaultValue={name ?? ""} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="phone" label="Phone" type="tel" />
        <Field id="entity" label="Company / entity" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partnerType">
          What best describes you?
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        </Label>
        <Select name="partnerType" required>
          <SelectTrigger id="partnerType" className="w-full">
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {PARTNER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Field id="mailingAddress" label="Mailing address" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="password" label="Password" type="password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
        <Field id="confirmPassword" label="Confirm password" type="password" />
      </div>
      <SubmitButton className="w-full" style={{ backgroundColor: "#143D4A" }}>
        Continue
      </SubmitButton>
    </ActionForm>
  );
}
