import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates, users } from "@/server/db/schema";
import { BrandedIntakeForm } from "@/components/marketing/branded-intake-form";
import { SiteHeader } from "@/components/marketing/site-header";
import { getDefaultLoanOfficerId } from "@/server/actions/referral-affiliates";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Loan Inquiry — Manna Lending",
};

/**
 * A partner's personal referral link: the same intake form as everyone else's,
 * with the partner attached so the deal is attributed to them automatically.
 * An unknown slug still shows the normal form (just no attribution).
 */
export default async function PartnerReferralPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const { submitted } = await searchParams;

  const partner = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.referralSlug, slug.toLowerCase()),
    columns: { id: true, status: true },
  });
  const loanOfficerId = await getDefaultLoanOfficerId();
  const loanOfficer = loanOfficerId ? await db.query.users.findFirst({ where: eq(users.id, loanOfficerId) }) : undefined;

  return (
    <>
      <SiteHeader />
      <BrandedIntakeForm
        loanOfficer={loanOfficer}
        submitted={submitted === "1"}
        redirectBasePath="/r"
        redirectTo={`/r/${slug}`}
        fontVariable={archivo.variable}
        showLogo={false}
        affiliateId={partner && partner.status !== "paused" ? partner.id : undefined}
      />
    </>
  );
}
