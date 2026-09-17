import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Archivo } from "next/font/google";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates } from "@/server/db/schema";
import { completeAffiliateSignup } from "@/server/actions/referral-affiliates";
import { MannaLogo } from "@/components/marketing/manna-logo";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Referral Program — Manna Lending",
};

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
} as CSSProperties;

const PAGE_CLASS = "min-h-screen p-4 py-10 md:p-10";
const PAGE_STYLE = { backgroundColor: TEAL };

export default async function AffiliateSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ affiliateId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { affiliateId } = await params;
  const { submitted } = await searchParams;

  const affiliate = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.id, affiliateId),
  });

  if (!affiliate) {
    return (
      <div className={`${archivo.variable} ${PAGE_CLASS} flex items-center justify-center`} style={PAGE_STYLE}>
        <div className="max-w-md rounded-sm p-8 text-center text-sm" style={{ ...CARD_STYLE, color: BASALT }}>
          This referral sign-up link isn&apos;t valid. Please reach out to whoever sent it to you.
        </div>
      </div>
    );
  }

  if (submitted === "1") {
    return (
      <div className={`${archivo.variable} ${PAGE_CLASS} flex items-center justify-center`} style={PAGE_STYLE}>
        <div className="max-w-md rounded-sm p-8 text-center" style={CARD_STYLE}>
          <MannaLogo className="mx-auto h-8 w-auto" />
          <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
            You&apos;re all set
          </h1>
          <p className="mt-2 text-sm" style={{ color: BASALT }}>
            Check your email — we just sent your personal referral link and embed code.
          </p>
        </div>
      </div>
    );
  }

  async function submitAction(formData: FormData) {
    "use server";
    await completeAffiliateSignup(affiliateId, formData);
    redirect(`/affiliate/${affiliateId}?submitted=1`);
  }

  return (
    <div className={`${archivo.variable} ${PAGE_CLASS}`} style={PAGE_STYLE}>
      <div className="mx-auto max-w-md rounded-sm p-6 md:p-10" style={CARD_STYLE}>
        <MannaLogo className="h-8 w-auto" />
        <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
          Join our referral program
        </h1>
        <p className="mt-2 text-sm" style={{ color: BASALT }}>
          A few details and we&apos;ll send you your own personal referral link.
        </p>
        <div className="mt-6">
          <ActionForm action={submitAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" style={{ color: BASALT }}>
                Your name
              </Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" style={{ color: BASALT }}>
                Phone
              </Label>
              <Input id="phone" name="phone" type="tel" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" style={{ color: BASALT }}>
                Email
              </Label>
              <Input id="email" name="email" type="email" defaultValue={affiliate.email} required />
              <p className="text-xs" style={{ color: BASALT, opacity: 0.7 }}>
                This is the email you gave us — change it here if you&apos;d rather use a different one.
              </p>
            </div>
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
