import { cookies } from "next/headers";
import { requirePartner } from "@/server/partner/session";
import { getPartnerDashboard } from "@/server/partner/portal-data";
import { buildPartnerLinks } from "@/server/actions/referral-affiliates";
import { DashboardView } from "@/components/partner/dashboard-view";

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const partner = await requirePartner();
  const [dashboard, links, params, cookieStore] = await Promise.all([
    getPartnerDashboard(partner),
    buildPartnerLinks(partner),
    searchParams,
    cookies(),
  ]);

  return (
    <DashboardView
      dashboard={dashboard}
      links={links}
      tier={partner.tier}
      showHowPaid={params.how === "1" || !cookieStore.get("partner_how_dismissed")}
      payment={{
        needed: dashboard.hasClosed || Boolean(partner.bankingRequestedAt),
        missingBanking: !partner.bankingReceivedAt,
        missingW9: !partner.w9ReceivedAt,
      }}
    />
  );
}
