import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Archivo } from "next/font/google";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates } from "@/server/db/schema";
import { completeAffiliateSignup, buildAffiliateReferralLinks } from "@/server/actions/referral-affiliates";
import { MannaLogo } from "@/components/marketing/manna-logo";
import { CopyButton } from "@/components/marketing/copy-button";
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

  // Once they've completed the sign-up form, this same link always shows
  // their referral info from here on — not just right after submitting.
  // That's deliberate: it's a more reliable place to come back to than
  // digging up the original welcome email, and it's the only place that
  // can offer a real, working copy button (email clients strip all
  // JavaScript, so a "click to copy" button can never work inside an email).
  if (submitted === "1" || affiliate.completedAt) {
    const links = await buildAffiliateReferralLinks(affiliateId);
    const firstName = affiliate.name?.trim().split(/\s+/)[0];
    return (
      <div className={`${archivo.variable} ${PAGE_CLASS} flex items-center justify-center`} style={PAGE_STYLE}>
        <div className="w-full max-w-lg rounded-sm p-6 md:p-10" style={CARD_STYLE}>
          <MannaLogo className="h-8 w-auto" />
          <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
            {submitted === "1"
              ? firstName
                ? `You're all set, ${firstName}`
                : "You're all set"
              : firstName
                ? `Welcome back, ${firstName}`
                : "Your referral info"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: BASALT }}>
            Anyone who submits a deal through your link is automatically tracked as your referral.
          </p>

          {!links ? (
            <p className="mt-6 text-sm" style={{ color: BASALT }}>
              We don&apos;t have a loan officer set up to attribute referrals to yet — reach out to whoever invited
              you.
            </p>
          ) : (
            <div className="mt-6 space-y-5">
              <div>
                <p className="text-xs font-medium tracking-wide uppercase" style={{ color: BASALT, opacity: 0.7 }}>
                  Your referral link
                </p>
                <div className="mt-1.5 flex items-stretch gap-2">
                  <div
                    className="flex-1 overflow-x-auto rounded-sm border px-3 py-2 text-sm whitespace-nowrap"
                    style={{ borderColor: "#CBB8A099", color: BASALT }}
                  >
                    {links.intakeLink}
                  </div>
                  <CopyButton text={links.intakeLink} label="Copy Link" style={{ backgroundColor: TEAL, color: OFF_WHITE }} />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium tracking-wide uppercase" style={{ color: BASALT, opacity: 0.7 }}>
                  Embed it on your own site instead
                </p>
                <div className="mt-1.5 flex items-stretch gap-2">
                  <pre
                    className="flex-1 overflow-x-auto rounded-sm border px-3 py-2 text-xs"
                    style={{ borderColor: "#CBB8A099", color: BASALT }}
                  >
                    {links.embedSnippet}
                  </pre>
                  <CopyButton text={links.embedSnippet} label="Copy Code" style={{ backgroundColor: TEAL, color: OFF_WHITE }} />
                </div>
              </div>
            </div>
          )}
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
