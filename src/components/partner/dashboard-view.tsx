import Link from "next/link";
import type { PortalDashboard } from "@/server/partner/portal-data";
import { PartnerLinkCard } from "@/components/partner/partner-link-card";
import { HowPaidBand } from "@/components/partner/how-paid-band";
import { ReferralsPanel } from "@/components/partner/referrals-panel";
import { howPaidFigures, type ReferralView } from "@/lib/partner-dashboard";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const TAN = "#CBB8A0";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";
const RULE = "rgba(203,184,160,0.7)";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const Label = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color }}>
    {children}
  </p>
);

/** The partner dashboard, given everything it shows. Shared by the real page and any preview. */
export function DashboardView({
  dashboard,
  links,
  tier,
  showHowPaid,
  payment,
  initialView,
}: {
  initialView?: ReferralView;
  dashboard: PortalDashboard;
  links: { shortLink: string | null; embedSnippet: string } | null;
  tier: number;
  showHowPaid: boolean;
  payment: { needed: boolean; missingBanking: boolean; missingW9: boolean };
}) {
  const figures = howPaidFigures(tier);
  const needsPayment = payment.needed;
  const missingBanking = payment.missingBanking;
  const missingW9 = payment.missingW9;

  const pipeline =
    dashboard.pipelineLow === dashboard.pipelineHigh
      ? money(dashboard.pipelineLow)
      : `${money(dashboard.pipelineLow)}–${money(dashboard.pipelineHigh)}`;
  const inFlightBreakdown = ([["submitted", "submitted"], ["review", "in review"], ["closing", "closing"]] as const)
    .filter(([key]) => dashboard.bucketCounts[key] > 0)
    .map(([key, word]) => `${dashboard.bucketCounts[key]} ${word}`)
    .join(", ");

  return (
    <div className="space-y-4">
      {needsPayment && (missingBanking || missingW9) && (
        <div className="border bg-white p-4" style={{ borderColor: TEAL }}>
          <p className="font-medium">Your referral closed — add your payment details now</p>
          <p className="mt-1 text-sm">
            Your payout goes out by ACH within 5 business days of our fee arriving from title. Wires land in days; mailed checks can take 2–3 weeks.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">ACH info: {missingBanking ? "needed" : "received ✓"}</span>
            <span className="rounded-full border px-2.5 py-1">W-9: {missingW9 ? "needed" : "received ✓"}</span>
            <Link
              href="/partner/payment"
              className="ml-auto px-4 py-2 text-xs font-medium tracking-[0.14em] text-white uppercase"
              style={{ backgroundColor: TEAL }}
            >
              Add payment details
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.9fr)]">
        <div className="flex flex-col justify-between gap-6 border bg-white p-5" style={{ borderColor: RULE }}>
          <Label color={MOSS}>Pipeline value to you</Label>
          <p
            className={`${pipeline.length > 9 ? "text-2xl whitespace-nowrap" : "text-5xl"} font-normal tabular-nums`}
            style={{ color: TEAL }}
          >
            {dashboard.inFlight ? pipeline : "$0"}
          </p>
          <p className="text-xs" style={{ color: MOSS }}>
            {dashboard.inFlight ? `Your share across ${plural(dashboard.inFlight, "deal")} in flight` : "Nothing in flight yet"}
          </p>
        </div>
        <div className="flex flex-col justify-between gap-6 p-5" style={{ backgroundColor: TAN, color: TEAL }}>
          <Label color={TEAL}>Paid to date</Label>
          <p className="text-5xl font-normal tabular-nums">{money(dashboard.paidToDate)}</p>
          <p className="text-xs">
            {dashboard.paidCount > 0
              ? `${plural(dashboard.paidCount, "funded deal")}, paid by ACH`
              : dashboard.awaitingPayout > 0
                ? `${money(dashboard.awaitingPayout)} closed, awaiting payout`
                : "Nothing paid yet"}
          </p>
        </div>
        <div className="flex flex-col justify-between gap-6 p-5" style={{ backgroundColor: BASALT, color: OFF_WHITE }}>
          <Label color={TAN}>Referrals in flight</Label>
          <p className="text-5xl font-normal tabular-nums">{dashboard.inFlight}</p>
          <p className="text-xs" style={{ color: TAN }}>
            {inFlightBreakdown || "Share your link to start"}
          </p>
        </div>
        <PartnerLinkCard shortLink={links?.shortLink ?? null} embedSnippet={links?.embedSnippet ?? ""} />
      </div>

      {showHowPaid && (
        <HowPaidBand
          rate={figures.firstDealRate}
          minimum={figures.minimum}
          exampleLoan={figures.exampleLoan}
          examplePayout={figures.examplePayout}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <ReferralsPanel initialView={initialView} referrals={dashboard.referrals} bucketCounts={dashboard.bucketCounts} fundedCount={dashboard.fundedCount} />

        <section className="h-fit border bg-white p-5" style={{ borderColor: RULE }}>
          <Label color={MOSS}>Recent activity</Label>
          {dashboard.activity.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: MOSS }}>
              Updates on your referrals show up here.
            </p>
          ) : (
            <ul className="mt-4">
              {dashboard.activity.map((a, i) => (
                <li
                  key={i}
                  className="flex gap-4 border-t py-2.5 text-sm first:border-t-0"
                  style={{ borderColor: RULE, color: a.paid ? TEAL : undefined }}
                >
                  <span className="w-12 shrink-0 text-xs" style={{ color: MOSS }}>
                    {a.date}
                  </span>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
