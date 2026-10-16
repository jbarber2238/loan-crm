"use client";

import { useState } from "react";
import { submitTransactionalIntake } from "@/server/actions/transactional";
import { ActionForm } from "@/components/forms/action-form";
import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { CostSummary } from "@/components/transactional/cost-summary";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { easternToday, isSameDayFundingByTiming } from "@/lib/same-day-funding";

// Same section-heading and field styling as the DSCR intake form
// (src/components/deals/intake-form-fields.tsx), so the two read as one site.
function SectionHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b pb-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
        {number}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function Req() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function Field({
  id,
  label,
  type = "text",
  required,
  optional,
  placeholder,
  min,
  onChange,
  inputMode,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  min?: string;
  onChange?: (value: string) => void;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <Req />}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      <Input
        id={id}
        name={id}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        inputMode={inputMode}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}

export function TransactionalRequestForm() {
  const [rawAmount, setRawAmount] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [sameDayChecked, setSameDayChecked] = useState(false);
  // null until they answer. "no" greys out the rest of the form: we act the
  // moment a request comes in, so there's nothing to do without a contract.
  const [underContract, setUnderContract] = useState<"yes" | "no" | null>(null);
  const notUnderContract = underContract === "no";

  const amount = Number(rawAmount.replace(/[$,\s]/g, ""));
  // Closing today, or just after the 4 PM Eastern cutoff, is same-day funding
  // whether or not they tick the box (the server applies the same rule).
  const sameDayByTiming = Boolean(closingDay) && isSameDayFundingByTiming(closingDay);
  const sameDay = sameDayByTiming || sameDayChecked;

  return (
    <ActionForm action={submitTransactionalIntake}>
      <div className="space-y-8">
        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required — every field is required.
        </p>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Is this property under contract?
            <Req />
          </legend>
          <div className="flex gap-6 text-sm">
            {(["yes", "no"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="underContract"
                  value={value}
                  required
                  checked={underContract === value}
                  onChange={() => setUnderContract(value)}
                  className="size-4"
                />
                {value === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
          {notUnderContract && (
            <p role="alert" className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive">
              The property must be under contract to request transactional funds.
            </p>
          )}
        </fieldset>

        <fieldset
          disabled={notUnderContract}
          aria-disabled={notUnderContract}
          className={`min-w-0 space-y-8 border-0 p-0 transition-opacity ${notUnderContract ? "pointer-events-none opacity-40 grayscale select-none" : ""}`}
        >
        <section className="space-y-4">
          <SectionHeading number={1} title="The Deal" />
          <Field id="propertyAddress" label="Property address" required />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              id="fundingAmount"
              label="Funding amount"
              required
              placeholder="$300,000"
              inputMode="decimal"
              onChange={setRawAmount}
            />
            <Field
              id="closingDate"
              label="Closing date"
              type="date"
              required
              min={easternToday()}
              onChange={setClosingDay}
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                name="sameDayFunding"
                checked={sameDay}
                disabled={sameDayByTiming}
                onCheckedChange={(v) => setSameDayChecked(v === true)}
              />
              I need the funds the same day (adds 0.25%)
            </label>
          </div>
          <CostSummary
            amount={rawAmount.trim() === "" || !Number.isFinite(amount) ? null : amount}
            sameDay={sameDay}
            tone="dark"
            sameDayNote={
              sameDayByTiming
                ? "Same-day funding applies with this closing date and the time of your request (4:00 PM Eastern cutoff)."
                : undefined
            }
          />
        </section>

        <section className="space-y-4">
          <SectionHeading number={2} title="Your Information" />
          <Field id="borrowerName" label="Your name" required />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="borrowerPhone" label="Phone" type="tel" required />
            <Field id="borrowerEmail" label="Email" type="email" required />
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading number={3} title="Title Company" />
          <Field id="titleCompanyName" label="Title company name" required />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field id="titleAgentName" label="Agent name" required />
            <Field id="titlePhone" label="Phone" type="tel" required />
            <Field id="titleEmail" label="Email" type="email" required />
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading number={4} title="Confirm" />
          <p className="text-sm leading-relaxed">
            We fund one kind of transaction: a <strong>traditional double close</strong> — the seller (A) sells to you (B),
            and you sell to your end buyer (C). We don&apos;t fund any other structure.
          </p>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" name="confirmDoubleClose" required className="mt-0.5 size-4 shrink-0" />
            <span>
              I confirm this is a traditional A-to-B, B-to-C double close.
              <Req />
            </span>
          </label>
          <p className="text-sm leading-relaxed">
            By submitting, you&apos;re formally requesting funding in the amount above. You acknowledge that we will
            contact the title company to coordinate funding the A-to-B portion of your transaction. This is not a request
            for a quote — our pricing is published on our website.
          </p>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox name="marketingConsent" className="mt-0.5" />
            <span>
              By checking this box, I consent to receive emails and text messages from Manna Lending regarding my service
              request — including updates on my funding request, requests for information, and answers to questions
              I&apos;ve asked. Message and data rates may apply. Reply STOP to opt out at any time. See our{" "}
              <Link href="/privacy" target="_blank" className="underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" target="_blank" className="underline">
                Terms &amp; Conditions
              </Link>
              .
            </span>
          </label>
        </section>

        <SubmitButton
          className="w-full rounded-sm py-3 text-sm font-medium tracking-wide text-white hover:opacity-90"
          style={{ backgroundColor: "#143D4A" }}
        >
          Submit funding request
        </SubmitButton>
        </fieldset>
      </div>
    </ActionForm>
  );
}
