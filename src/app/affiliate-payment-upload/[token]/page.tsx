import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Archivo } from "next/font/google";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates } from "@/server/db/schema";
import { uploadAffiliatePaymentInfo } from "@/server/actions/referral-affiliates";
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
  title: "Upload Payment Info — Manna Lending",
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

// Deliberately one-way: this page can only ever create a new upload row. It
// never lists, links to, or displays anything previously uploaded through
// this same link — the only place that data is ever readable back is the
// authenticated admin Settings > Referrals page.
export default async function AffiliatePaymentUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const { submitted } = await searchParams;

  const affiliate = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.wireInstructionsUploadToken, token),
    columns: { id: true, name: true },
  });

  if (!affiliate) {
    return (
      <div className={`${archivo.variable} ${PAGE_CLASS} flex items-center justify-center`} style={PAGE_STYLE}>
        <div className="max-w-md rounded-sm p-8 text-center text-sm" style={{ ...CARD_STYLE, color: BASALT }}>
          This upload link isn&apos;t valid. Please reach out to whoever sent it to you.
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
            Received — thank you
          </h1>
          <p className="mt-2 text-sm" style={{ color: BASALT }}>
            We&apos;ve got your payment info on file and will get your referral fee sent out.
          </p>
        </div>
      </div>
    );
  }

  async function submitAction(formData: FormData) {
    "use server";
    await uploadAffiliatePaymentInfo(token, formData);
    redirect(`/affiliate-payment-upload/${token}?submitted=1`);
  }

  return (
    <div className={`${archivo.variable} ${PAGE_CLASS}`} style={PAGE_STYLE}>
      <div className="mx-auto max-w-md rounded-sm p-6 md:p-10" style={CARD_STYLE}>
        <MannaLogo className="h-8 w-auto" />
        <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
          Upload your payment info
        </h1>
        <p className="mt-2 text-sm" style={{ color: BASALT }}>
          {affiliate.name ? `Hi ${affiliate.name} — ` : ""}upload a copy of your ACH or wire instructions so we can
          send your referral fee.
        </p>
        <div className="mt-6">
          <ActionForm action={submitAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="file" style={{ color: BASALT }}>
                File
              </Label>
              <Input id="file" name="file" type="file" required />
            </div>
            <SubmitButton
              className="w-full rounded-sm py-3 text-sm font-medium tracking-wide text-white hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              Upload
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
