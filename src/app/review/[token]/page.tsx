import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { closingSurveys, referralAffiliates } from "@/server/db/schema";
import { getPortalLook } from "@/server/settings";
import { partnerEmailAllowed } from "@/server/partner/email";
import { PortalFrame } from "@/components/borrower-upload/portal-frame";
import { SurveyWizard } from "@/components/review/survey-wizard";
import { defaultReviewerName, offerReferralProgram } from "@/lib/closing-survey";
import { ThankYou } from "@/components/review/thank-you";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Share your experience", robots: { index: false } };

export default async function ClosingSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await db.query.closingSurveys.findFirst({
    where: eq(closingSurveys.token, token),
    with: { deal: { columns: { borrowerName: true, borrowerEmail: true, propertyAddress: true } } },
  });
  const { theme, logo, companyName } = await getPortalLook();

  if (!survey) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This link isn&apos;t valid. Reply to the email we sent you and we&apos;ll get you a new one.
          </CardContent>
        </Card>
      </div>
    );
  }

  const first = survey.deal.borrowerName.trim().split(/\s+/)[0] || "there";
  const done = survey.status === "completed";

  let pitch: "offer" | "partner" | null = null;
  if (done && offerReferralProgram(survey.scoreRecommend) && survey.deal.borrowerEmail) {
    const email = survey.deal.borrowerEmail.trim().toLowerCase();
    if (await partnerEmailAllowed(email)) {
      const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.email, email), columns: { status: true } });
      pitch = partner?.status === "active" ? "partner" : "offer";
    }
  }

  return (
    <PortalFrame
      theme={theme}
      logo={logo}
      companyName={companyName}
      headerExtra={
        <>
          <h1 className="mt-4 text-lg font-semibold text-balance sm:text-xl">
            {done ? "Thank you for your feedback" : `Congratulations on your closing, ${first}! 🎉`}
          </h1>
          <p className={`mt-1 text-sm ${theme ? "bp-muted" : "text-primary-foreground/80"}`}>
            {done
              ? survey.deal.propertyAddress
              : `It was an honor to get you to the closing table on ${survey.deal.propertyAddress}. Tell us how we did. It takes about a minute.`}
          </p>
        </>
      }
    >
      {done ? (
        <ThankYou referralHref={`/review/${token}/referral`} first={first} pitch={pitch} />
      ) : (
        <SurveyWizard token={token} defaultName={defaultReviewerName(survey.deal.borrowerName)} />
      )}
    </PortalFrame>
  );
}
