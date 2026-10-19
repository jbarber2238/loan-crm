"use client";

import { registerForFriday } from "@/server/actions/friday";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRIDAY_CONSENT_TEXT, FRIDAY_ROLES } from "@/lib/friday-constants";

function Field({ id, label, type = "text", autoComplete }: { id: string; label: string; type?: string; autoComplete?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        <span className="text-destructive" aria-hidden="true">
          {" "}
          *
        </span>
      </Label>
      <Input id={id} name={id} type={type} required autoComplete={autoComplete} />
    </div>
  );
}

export function FridayForm() {
  return (
    <ActionForm action={registerForFriday} className="space-y-4">
      <Field id="name" label="Your name" autoComplete="name" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="email" label="Email" type="email" autoComplete="email" />
        <Field id="phone" label="Phone" type="tel" autoComplete="tel" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="role">
          What best describes you?
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        </Label>
        <Select name="role" required>
          <SelectTrigger id="role" className="w-full">
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {FRIDAY_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <SubmitButton
        className="w-full rounded-sm py-3 text-sm font-medium tracking-wide text-white hover:opacity-90"
        style={{ backgroundColor: "#143D4A" }}
      >
        Save my seat for Friday
      </SubmitButton>
      <p className="text-xs leading-relaxed text-muted-foreground">{FRIDAY_CONSENT_TEXT}</p>
    </ActionForm>
  );
}
