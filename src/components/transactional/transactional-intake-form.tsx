"use client";

import { submitTransactionalIntake } from "@/server/actions/transactional";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Field({ id, label, type = "text", required, placeholder }: { id: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input id={id} name={id} type={type} required={required} placeholder={placeholder} step={type === "number" ? "0.01" : undefined} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border bg-white p-5">
      <legend className="px-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function TransactionalIntakeForm() {
  return (
    <ActionForm action={submitTransactionalIntake} className="space-y-5">
      <Section title="The transaction">
        <div className="sm:col-span-2">
          <Field id="propertyAddress" label="Property address" required />
        </div>
        <Field id="fundingAmount" label="Funding amount ($)" type="number" required placeholder="300000" />
        <Field id="closingDate" label="Closing date" type="date" required />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox name="sameDayFunding" />I need the funds the same day
        </label>
      </Section>

      <Section title="Your information">
        <div className="sm:col-span-2">
          <Field id="borrowerName" label="Your name" required />
        </div>
        <Field id="borrowerPhone" label="Phone" type="tel" required />
        <Field id="borrowerEmail" label="Email" type="email" required />
      </Section>

      <Section title="Title company">
        <div className="sm:col-span-2">
          <Field id="titleCompanyName" label="Title company name" required />
        </div>
        <Field id="titleAgentName" label="Title agent name" />
        <Field id="titlePhone" label="Title phone" type="tel" />
        <div className="sm:col-span-2">
          <Field id="titleEmail" label="Title email" type="email" />
        </div>
      </Section>

      <SubmitButton className="w-full" style={{ backgroundColor: "#143D4A" }}>
        Submit request
      </SubmitButton>
    </ActionForm>
  );
}
