import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { submitPublicIntake } from "@/server/actions/intake";
import { IntakeFormFields } from "@/components/deals/intake-form-fields";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { MannaLogo } from "@/components/marketing/manna-logo";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-archivo",
});

// Same brand tokens as the marketing site — this route exists specifically
// to be dropped into mannalendingco.com (or wherever Justin's own site
// lives) via <iframe>, so it needs to look like part of that site rather
// than like the internal CRM's default UI. Single-tenant today; if this app
// ever grows real multi-tenancy, these constants become per-org settings
// the same way company name/logo already are.
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

export const metadata: Metadata = {
  title: "Loan Inquiry — Manna Lending",
};

export default async function EmbeddableIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ loanOfficerId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { loanOfficerId } = await params;
  const { submitted } = await searchParams;

  const loanOfficer = await db.query.users.findFirst({
    where: eq(users.id, loanOfficerId),
  });

  // Re-themes every shadcn control (Input, Select, Checkbox, Button) inside
  // this subtree via the same CSS variables they already read from
  // globals.css — no changes needed to IntakeFormFields itself, which stays
  // neutral for the internal staff form and for future non-Manna orgs.
  const wrapperStyle = {
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

  if (!loanOfficer || !loanOfficer.active) {
    return (
      <div className={`${archivo.variable} p-6 text-center text-sm`} style={{ ...wrapperStyle, color: BASALT }}>
        This intake link isn&apos;t active. Please reach out to your loan officer directly.
      </div>
    );
  }

  if (submitted === "1") {
    return (
      <div className={`${archivo.variable} p-8 text-center`} style={wrapperStyle}>
        <MannaLogo className="mx-auto h-8 w-auto" />
        <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
          Thanks — we&apos;ve got it
        </h1>
        <p className="mt-2 text-sm" style={{ color: BASALT }}>
          {loanOfficer.name} will follow up with you shortly.
        </p>
      </div>
    );
  }

  async function submitAction(formData: FormData) {
    "use server";
    await submitPublicIntake(loanOfficerId, formData, "/embed/intake");
  }

  return (
    <div className={`${archivo.variable} p-4 py-8 md:p-8`} style={wrapperStyle}>
      <div className="mx-auto max-w-2xl">
        <MannaLogo className="h-8 w-auto" />
        <p className="mt-4 text-sm" style={{ color: BASALT }}>
          Please complete this form to receive a pricing quote. Working with {loanOfficer.name}.
        </p>
        <div className="mt-6">
          <ActionForm action={submitAction} className="space-y-6">
            <IntakeFormFields />
            <label className="flex items-start gap-2 text-xs" style={{ color: BASALT }}>
              <Checkbox name="marketingConsent" className="mt-0.5" />
              <span>
                By checking this box, I consent to receive emails and text messages from Manna Lending regarding
                my service request and marketing and promotional messages, including special offers, discounts,
                and product updates.
              </span>
            </label>
            <SubmitButton className="w-full rounded-sm py-3 text-sm font-medium tracking-wide text-white hover:opacity-90" style={{ backgroundColor: TEAL }}>
              Submit
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
