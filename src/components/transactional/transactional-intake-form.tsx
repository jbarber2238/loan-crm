"use client";

import { useState } from "react";
import { submitTransactionalIntake } from "@/server/actions/transactional";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MINIMUM_FUNDING_AMOUNT } from "@/lib/transactional-fees";
import { easternToday, isSameDayFundingByTiming } from "@/lib/same-day-funding";

function Field({
  id,
  label,
  type = "text",
  required,
  placeholder,
  min,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: number | string;
  hint?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input id={id} name={id} type={type} required={required} placeholder={placeholder} min={min} step={type === "number" ? "0.01" : undefined} onChange={onChange ? (e) => onChange(e.target.value) : undefined} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  const [closingDay, setClosingDay] = useState("");
  const [sameDayChecked, setSameDayChecked] = useState(false);
  // Closing today, or after the 4 PM Eastern cutoff the day before, is same-day
  // funding whether or not they tick the box.
  const sameDayByTiming = Boolean(closingDay) && isSameDayFundingByTiming(closingDay);

  return (
    <ActionForm action={submitTransactionalIntake} className="space-y-5">
      <fieldset className="space-y-3 rounded-lg border bg-white p-5">
        <legend className="px-1 text-xs font-semibold tracking-wide uppercase text-muted-foreground">Deal structure</legend>
        <p className="text-sm leading-relaxed">
          We fund one kind of transaction: a <strong>traditional double close</strong> — the seller (A) sells to you (B),
          and you sell to your end buyer (C). We don&apos;t fund any other structure.
        </p>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" name="confirmDoubleClose" required className="mt-0.5 size-4 shrink-0" />
          <span>I confirm this is a traditional A-to-B, B-to-C double close.</span>
        </label>
        <p className="text-xs text-muted-foreground">
          If your deal is any other structure, we aren&apos;t the right fit and can&apos;t fund it.
        </p>
      </fieldset>

      <Section title="The transaction">
        <div className="sm:col-span-2">
          <Field id="propertyAddress" label="Property address" required />
        </div>
        <Field id="fundingAmount" label="Funding amount ($)" type="number" required placeholder="300000" min={MINIMUM_FUNDING_AMOUNT} hint="Double closes from $100,000." />
        <Field id="closingDate" label="Closing date" type="date" required min={easternToday()} onChange={setClosingDay} />
        <div className="space-y-1 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="sameDayFunding"
              checked={sameDayByTiming || sameDayChecked}
              disabled={sameDayByTiming}
              onCheckedChange={(v) => setSameDayChecked(v === true)}
            />
            I need the funds the same day
          </label>
          {sameDayByTiming && (
            <p className="text-xs text-muted-foreground">
              With this closing date and the time of day (4:00 PM Eastern cutoff), this is a same-day funding request.
            </p>
          )}
        </div>
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

      <p className="rounded-lg border bg-white p-4 text-sm leading-relaxed">
        By submitting, you&apos;re formally requesting funding in the amount above. You acknowledge that we will
        contact the title company to coordinate funding the A-to-B portion of your transaction. This is not a request for
        a quote — our pricing is published on our website.
      </p>

      <SubmitButton className="w-full" style={{ backgroundColor: "#143D4A" }}>
        Submit funding request
      </SubmitButton>
    </ActionForm>
  );
}
