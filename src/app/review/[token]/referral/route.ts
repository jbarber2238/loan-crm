import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { closingSurveys } from "@/server/db/schema";
import { partnerEmailAllowed } from "@/server/partner/email";
import { issuePartnerSetupLink } from "@/server/partner/invite";
import { offerReferralProgram } from "@/lib/closing-survey";

// The "Set up my referral link" button. The partner record is only created here, when a client who
// said they'd recommend us actually clicks, so the partner list isn't filled with people who didn't.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = new URL(`/review/${token}`, request.url);

  const survey = await db.query.closingSurveys.findFirst({
    where: eq(closingSurveys.token, token),
    with: { deal: { columns: { borrowerName: true, borrowerEmail: true } } },
  });
  const email = survey?.deal.borrowerEmail?.trim().toLowerCase();
  if (!survey || survey.status !== "completed" || !email || !offerReferralProgram(survey.scoreRecommend)) {
    return Response.redirect(back, 302);
  }
  if (!(await partnerEmailAllowed(email))) return Response.redirect(back, 302);

  const link = await issuePartnerSetupLink(email, survey.deal.borrowerName);
  if (!link) return Response.redirect(back, 302);
  // Already finished setting up: they just need to sign in.
  return Response.redirect(link.url ?? new URL("/partner/sign-in", request.url), 302);
}
