import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { buildPartnerLinks } from "@/server/actions/referral-affiliates";
import { isProgramLive } from "@/server/partner/email";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/partner/copy-button";
import { ContactQuickActions } from "@/components/messaging/contact-quick-actions";
import { MarkPaidControl } from "@/components/deals/partner-payout-controls";
import {
  InvitePartnerForm,
  MigrateLegacyButton,
  PartnerActions,
  ProgramLiveSwitch,
  RevealBanking,
} from "@/components/settings/partner-admin-controls";

const DAY = 24 * 60 * 60 * 1000;
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<string, string> = {
  legacy: "Pre-portal affiliate",
  invited: "Invited — hasn't set up yet",
  profile_complete: "Needs to accept terms",
  active: "Active",
  paused: "Paused",
};

export default async function ReferralsSettingsPage() {
  await requireAdmin();
  const now = new Date().getTime();

  const [partners, live, payouts] = await Promise.all([
    db.query.referralAffiliates.findMany({
      orderBy: (a, { desc }) => desc(a.createdAt),
      with: {
        deals: { columns: { id: true, createdAt: true } },
        paymentDocuments: { orderBy: (d, { desc }) => desc(d.createdAt) },
      },
    }),
    isProgramLive(),
    db.query.partnerPayouts.findMany({
      orderBy: (p, { desc }) => desc(p.createdAt),
      with: { deal: { columns: { id: true, propertyAddress: true, borrowerName: true } }, partner: { columns: { name: true, email: true } } },
    }),
  ]);

  const legacyCount = partners.filter((p) => p.status === "legacy").length;
  const stalled = partners.filter(
    (p) => (p.status === "invited" || p.status === "profile_complete") && p.portalInvitedAt && now - p.portalInvitedAt.getTime() > 5 * DAY
  );
  const quiet = partners.filter((p) => {
    if (p.status !== "active") return false;
    const last = Math.max(p.termsAcceptedAt?.getTime() ?? 0, ...p.deals.map((d) => d.createdAt.getTime()));
    return last > 0 && now - last > 45 * DAY;
  });

  const linksByPartner = new Map(
    await Promise.all(partners.filter((p) => p.status !== "legacy").map(async (p) => [p.id, await buildPartnerLinks(p)] as const))
  );

  const openPayouts = payouts.filter((p) => p.status !== "paid");
  const paidPayouts = payouts.filter((p) => p.status === "paid");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <ProgramLiveSwitch live={live} />
          <InvitePartnerForm />
        </CardContent>
      </Card>

      {legacyCount > 0 && <MigrateLegacyButton count={legacyCount} live={live} />}

      {(stalled.length > 0 || quiet.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs a nudge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {stalled.map((p) => (
              <p key={p.id}>
                <span className="font-medium">{p.name ?? p.email}</span> hasn&apos;t finished setting up (invited{" "}
                {Math.floor((now - (p.portalInvitedAt?.getTime() ?? now)) / DAY)} days ago).
              </p>
            ))}
            {quiet.map((p) => (
              <p key={p.id}>
                <span className="font-medium">{p.name ?? p.email}</span> hasn&apos;t sent a referral in 45+ days.
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {openPayouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payouts to send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openPayouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <Link href={`/deals/${p.deal.id}`} className="font-medium underline underline-offset-2">
                    {p.deal.propertyAddress}
                  </Link>
                  <p className="text-muted-foreground">
                    {p.partner.name ?? p.partner.email} · {p.kind === "trailing" ? "repeat" : "first"} deal at {Number(p.rate)}% ·{" "}
                    {p.amount ? money(Number(p.amount)) : "amount set when the fee is received"} ·{" "}
                    {p.status === "ready" ? "ready to pay" : "waiting on fee or payment details"}
                  </p>
                </div>
                {p.status === "ready" && p.amount && <MarkPaidControl payoutId={p.id} amount={Number(p.amount)} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {partners.length === 0 && <p className="text-sm text-muted-foreground">No partners yet.</p>}

      {partners.map((p) => {
        const links = linksByPartner.get(p.id);
        const paidTotal = paidPayouts.filter((x) => x.partnerId === p.id).reduce((s, x) => s + Number(x.paidAmount ?? 0), 0);
        const label = p.name ?? p.email;
        const hasBanking = Boolean(p.bankingReceivedAt) || p.paymentDocuments.length > 0;
        return (
          <Card key={p.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {label}
                {p.name && <span className="font-normal text-muted-foreground">— {p.email}</span>}
                <Badge variant={p.status === "active" ? "success" : "secondary"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                {p.status === "active" || p.status === "paused" ? <Badge variant="outline">{p.tier}% tier</Badge> : null}
              </CardTitle>
              <PartnerActions partnerId={p.id} status={p.status} tier={p.tier} name={label} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.phone && (
                <p className="flex items-center gap-1 text-muted-foreground">
                  Phone: {p.phone}
                  <ContactQuickActions phone={p.phone} name={label} contactType="Referral Partner" />
                </p>
              )}
              {(p.entity || p.partnerType) && (
                <p className="text-muted-foreground">
                  {[p.entity, p.partnerType].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="text-muted-foreground">
                Referrals: <span className="font-medium text-foreground">{p.deals.length}</span> · Paid to date:{" "}
                <span className="font-medium text-foreground">{money(paidTotal)}</span>
              </p>
              {(p.status === "active" || p.status === "paused") && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={hasBanking ? "success" : "warning"}>{hasBanking ? "ACH on file" : "ACH needed"}</Badge>
                  <Badge variant={p.w9ReceivedAt ? "success" : "warning"}>{p.w9ReceivedAt ? "W-9 on file" : "W-9 needed"}</Badge>
                  {p.w9PdfData && (
                    <a href={`/api/partner-w9/${p.id}`} className="underline underline-offset-2">
                      Download W-9
                    </a>
                  )}
                  {p.bankingEncrypted && <RevealBanking partnerId={p.id} last4={p.bankingLast4} />}
                  {p.paymentDocuments.map((doc) => (
                    <a key={doc.id} href={`/api/affiliate-payment-documents/${doc.id}`} className="underline underline-offset-2">
                      {doc.fileName}
                    </a>
                  ))}
                </div>
              )}
              {links && p.status !== "invited" && (
                <div className="flex flex-wrap gap-2">
                  {links.shortLink && <CopyButton text={links.shortLink} label="Copy referral link" />}
                  <CopyButton text={links.intakeLink} label="Copy long link" />
                  <CopyButton text={links.embedSnippet} label="Copy embed code" />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
