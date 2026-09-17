import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { deleteAffiliate, getDefaultLoanOfficerId } from "@/server/actions/referral-affiliates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { CopyIntakeLinkButton } from "@/components/deals/copy-intake-link-button";
import { CopyEmbedCodeButton } from "@/components/deals/copy-embed-code-button";
import { InviteAffiliateDialog } from "@/components/settings/invite-affiliate-dialog";

export default async function ReferralsSettingsPage() {
  await requireAdmin();

  const [affiliates, loanOfficerId] = await Promise.all([
    db.query.referralAffiliates.findMany({
      orderBy: (a, { desc }) => desc(a.createdAt),
    }),
    getDefaultLoanOfficerId(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Invite someone by email to set them up as a referral affiliate. They&apos;ll get an email with a short
          sign-up form, and once they submit it, their own referral link and embed code are ready here — and
          emailed straight to them.
        </p>
        <InviteAffiliateDialog />
      </div>

      {affiliates.length === 0 && (
        <p className="text-sm text-muted-foreground">No referral affiliates yet.</p>
      )}

      {affiliates.map((affiliate) => {
        const pending = !affiliate.completedAt;
        return (
          <Card key={affiliate.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                {pending ? (
                  <>
                    {affiliate.email}
                    <Badge variant="secondary">Invited — hasn&apos;t completed sign-up yet</Badge>
                  </>
                ) : (
                  <>
                    {affiliate.name} <span className="text-muted-foreground font-normal">— {affiliate.email}</span>
                  </>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {loanOfficerId && (
                  <>
                    <CopyIntakeLinkButton loanOfficerId={loanOfficerId} affiliateId={affiliate.id} />
                    <CopyEmbedCodeButton loanOfficerId={loanOfficerId} affiliateId={affiliate.id} />
                  </>
                )}
                <ActionForm
                  action={deleteAffiliate.bind(null, affiliate.id)}
                  successMessage="Removed"
                  confirmMessage={
                    pending
                      ? `Withdraw the invite for ${affiliate.email}?`
                      : `Remove ${affiliate.name} from your referral affiliates? This can't be undone — if they've referred any deals, removal will be blocked.`
                  }
                >
                  <SubmitButton variant="destructive" size="sm">
                    {pending ? "Withdraw invite" : "Remove"}
                  </SubmitButton>
                </ActionForm>
              </div>
            </CardHeader>
            {!pending && (
              <CardContent>
                <p className="text-sm text-muted-foreground">Phone: {affiliate.phone}</p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
