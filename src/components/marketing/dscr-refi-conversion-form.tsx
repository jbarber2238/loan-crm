import type { CSSProperties } from "react";
import Link from "next/link";
import { submitConversionIntake } from "@/server/actions/deal-conversion";
import { buildConversionPrefill } from "@/server/dscr-conversion-prefill";
import { DSCR_REFI_TARGET_CATEGORIES } from "@/lib/labels";
import { IntakeFormFields } from "@/components/deals/intake-form-fields";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { MannaLogo } from "@/components/marketing/manna-logo";
import type { deals as dealsTable } from "@/server/db/schema";

// Same brand tokens/re-theming approach as BrandedIntakeForm — see that
// file's own comments for why these CSS variables exist.
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

const CARD_STYLE = {
  fontFamily: "var(--font-archivo), Archivo, sans-serif",
  backgroundColor: OFF_WHITE,
  "--primary": TEAL,
  "--primary-foreground": OFF_WHITE,
  "--ring": TEAL,
  "--input": "#CBB8A099",
  "--border": "#CBB8A099",
  "--accent": "#CBB8A040",
  "--accent-foreground": TEAL,
} as CSSProperties;

const PAGE_CLASS = "min-h-screen p-4 py-10 md:p-10";
const PAGE_STYLE = { backgroundColor: TEAL };

export function DscrRefiConversionForm({
  token,
  submitted,
  alreadyUsed,
  sourceDeal,
  fontVariable,
}: {
  token: string;
  submitted: boolean;
  alreadyUsed: boolean;
  sourceDeal: (typeof dealsTable.$inferSelect) | null;
  fontVariable: string;
}) {
  if (!sourceDeal) {
    return (
      <div className={`${fontVariable} ${PAGE_CLASS} flex items-center justify-center`} style={PAGE_STYLE}>
        <div className="max-w-md rounded-sm p-8 text-center text-sm" style={{ ...CARD_STYLE, color: BASALT }}>
          This link isn&apos;t valid. Please reach out to your loan officer for a new one.
        </div>
      </div>
    );
  }

  if (submitted || alreadyUsed) {
    return (
      <div className={`${fontVariable} ${PAGE_CLASS} flex items-center justify-center`} style={PAGE_STYLE}>
        <div className="max-w-md rounded-sm p-8 text-center" style={CARD_STYLE}>
          <MannaLogo className="mx-auto h-8 w-auto" />
          <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
            Thanks — we&apos;ve got it
          </h1>
          <p className="mt-2 text-sm" style={{ color: BASALT }}>
            Your loan officer will follow up with you shortly about your DSCR refinance.
          </p>
        </div>
      </div>
    );
  }

  const { defaultValues, highlightNames } = buildConversionPrefill(sourceDeal);

  async function submitAction(formData: FormData) {
    "use server";
    await submitConversionIntake(token, formData);
  }

  return (
    <div className={`${fontVariable} ${PAGE_CLASS}`} style={PAGE_STYLE}>
      <div className="mx-auto max-w-2xl rounded-sm p-6 md:p-10" style={CARD_STYLE}>
        <MannaLogo className="h-8 w-auto" />
        <h1 className="mt-4 text-lg font-medium" style={{ color: TEAL }}>
          DSCR Refinance Request
        </h1>
        <p className="mt-2 text-sm" style={{ color: BASALT }}>
          Since your {sourceDeal.propertyAddress} project (Loan #{sourceDeal.loanNumber}) went through us already,
          we&apos;ve pre-filled what we already know below — fields marked{" "}
          <span className="font-medium">&quot;Carried over — please confirm&quot;</span> just need a quick check
          for accuracy (correct anything that&apos;s changed, like a different LLC). Everything else is new —
          please fill it in so we can put together your refinance quote.
        </p>
        <div className="mt-6">
          <ActionForm action={submitAction} className="space-y-6">
            <IntakeFormFields
              categoryOptions={DSCR_REFI_TARGET_CATEGORIES}
              defaultValues={defaultValues}
              highlightNames={highlightNames}
            />
            <label className="flex items-start gap-2 text-xs" style={{ color: BASALT }}>
              <Checkbox name="marketingConsent" className="mt-0.5" />
              <span>
                By checking this box, I consent to receive emails and text messages from Manna Lending regarding
                my service request — including updates on my loan application, requests for documents, and
                answers to questions I&apos;ve asked. Message and data rates may apply. Reply STOP to opt out at
                any time. See our{" "}
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
            <SubmitButton
              className="w-full rounded-sm py-3 text-sm font-medium tracking-wide text-white hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              Submit
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
