"use client";

import Link from "next/link";
import { submitLead } from "@/server/actions/leads";
import { ActionForm, useFormPending } from "@/components/forms/action-form";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";

function GateSubmitButton({ label }: { label: string }) {
  const isPending = useFormPending();
  return (
    <button
      type="submit"
      disabled={isPending}
      className="w-full rounded-sm py-2.5 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ backgroundColor: TEAL }}
    >
      {isPending ? "Unlocking…" : label}
    </button>
  );
}

function GateField({
  id,
  label,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        required
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-sm border bg-white px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: "rgba(30,30,30,0.2)", color: BASALT }}
      />
    </label>
  );
}

/**
 * Gates any lead magnet behind name/phone/email + marketing consent — pass
 * a unique `source` key per tool (recorded on the lead, and the only thing
 * that needs to change to reuse this for a future lead magnet). Consent is
 * a hard gate, not optional: no checkbox, no calculator — that's a
 * deliberate business decision, not an oversight, and covers email and
 * manual phone calls only (no autodialer, no texting yet).
 */
export function LeadGateForm({
  source,
  buttonLabel = "Unlock My Calculator",
  onUnlock,
}: {
  source: string;
  buttonLabel?: string;
  onUnlock: (leadId: string) => void;
}) {
  async function action(formData: FormData) {
    const { leadId } = await submitLead(source, formData);
    onUnlock(leadId);
  }

  return (
    <div className="mx-auto max-w-md rounded-sm border bg-white p-6 shadow-[0_12px_32px_rgba(20,61,74,0.12)] md:p-8">
      <h2 className="text-lg font-medium" style={{ color: TEAL }}>
        Get instant access
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BASALT }}>
        Enter your info and the calculator unlocks right below — no download, no waiting.
      </p>

      <ActionForm action={action} className="mt-6 space-y-4">
        {/* Honeypot — real visitors never see this (off-screen, not type="hidden",
            so a bot's basic field scraper still finds and fills it). */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <GateField id="name" label="Full Name" placeholder="Jane Investor" />
        <GateField id="phone" label="Phone Number" type="tel" placeholder="(555) 123-4567" />
        <GateField id="email" label="Email Address" type="email" placeholder="jane@example.com" />
        <label className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: MOSS }}>
          <input type="checkbox" name="consent" required className="mt-0.5 size-3.5 shrink-0" />
          <span>
            I agree to receive emails and phone calls from Manna Lending about my deals and financing options. See
            our{" "}
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
        <GateSubmitButton label={buttonLabel} />
      </ActionForm>
    </div>
  );
}
