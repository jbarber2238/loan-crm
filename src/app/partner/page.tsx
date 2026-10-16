import Link from "next/link";
import { cookies } from "next/headers";
import { requirePartner } from "@/server/partner/session";
import { getPartnerDashboard, type PortalReferral } from "@/server/partner/portal-data";
import { buildPartnerLinks } from "@/server/actions/referral-affiliates";
import { PartnerLinkCard } from "@/components/partner/partner-link-card";
import { HowPaidBand } from "@/components/partner/how-paid-band";
import { BUCKET_LABELS, howPaidFigures } from "@/lib/partner-dashboard";

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

function StageMarker({ bucket }: { bucket: PortalReferral["bucket"] }) {
  const filled = bucket === "closing" ? TEAL : bucket === "funded" ? MOSS : null;
  return (
    <span
      className="inline-block size-2.5 shrink-0 border"
      style={{ borderColor: filled ?? (bucket === "review" ? TEAL : "#9A9A94"), backgroundColor: filled ?? "transparent" }}
      aria-hidden="true"
    />
  );
}

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
  const showHowPaid = params.how === "1" || !cookieStore.get("partner_how_dismissed");
  const figures = howPaidFigures(partner.tier);

  const needsPayment = dashboard.hasClosed || Boolean(partner.bankingRequestedAt);
  const missingBanking = !partner.bankingReceivedAt;
  const missingW9 = !partner.w9ReceivedAt;

  const pipeline =
    dashboard.pipelineLow === dashboard.pipelineHigh
      ? money(dashboard.pipelineLow)
      : `${money(dashboard.pipelineLow)}–${money(dashboard.pipelineHigh)}`;
  const inFlightBreakdown = ([["submitted", "submitted"], ["review", "in review"], ["closing", "closing"]] as const)
    .filter(([key]) => dashboard.bucketCounts[key] > 0)
    .map(([key, word]) => `${dashboard.bucketCounts[key]} ${word}`)
    .join(", ");
  const steps = [
    ["submitted", "01"],
    ["review", "02"],
    ["closing", "03"],
    ["funded", "04"],
  ] as const;
  const barColor = { submitted: TAN, review: TAN, closing: TEAL, funded: MOSS };

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="border bg-white p-5" style={{ borderColor: RULE }}>
          <div className="flex items-baseline justify-between gap-3">
            <Label color={MOSS}>Your referrals</Label>
            <p className="text-xs" style={{ color: MOSS }}>
              {plural(dashboard.referrals.length, "referral")}, {dashboard.fundedCount} funded
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {steps.map(([key, n]) => (
              <div key={key}>
                <div className="h-[3px]" style={{ backgroundColor: barColor[key] }} />
                <p className="mt-2 text-4xl font-normal tabular-nums" style={{ color: key === "submitted" ? MOSS : TEAL }}>
                  {dashboard.bucketCounts[key]}
                </p>
                <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color: MOSS }}>
                  {n} {BUCKET_LABELS[key]}
                </p>
              </div>
            ))}
          </div>

          {dashboard.referrals.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-[10px] tracking-[0.18em] uppercase" style={{ color: MOSS }}>
                    <th className="pb-2 font-normal">Borrower</th>
                    <th className="pb-2 font-normal">Loan type</th>
                    <th className="pb-2 font-normal">Loan amount</th>
                    <th className="pb-2 font-normal">Stage</th>
                    <th className="pb-2 text-right font-normal">Your payout</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.referrals.map((r) => (
                    <tr key={r.id} className="border-t align-middle" style={{ borderColor: RULE }}>
                      <td className="py-3 pr-3">
                        <p>{r.borrower}</p>
                        <p className="text-[11px]" style={{ color: MOSS }}>
                          Referred {r.referredOn}
                        </p>
                      </td>
                      <td className="py-3 pr-3">{r.loanType}</td>
                      <td className="py-3 pr-3 tabular-nums">{r.loanAmount ? money(r.loanAmount) : "—"}</td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <StageMarker bucket={r.bucket} />
                          {BUCKET_LABELS[r.bucket]}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <p className="text-xl tabular-nums" style={{ color: r.payoutStatus === "paid" ? MOSS : TEAL }}>
                          {r.payoutText}
                        </p>
                        <p className="text-[11px]" style={{ color: MOSS }}>
                          {r.payoutNote}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: RULE, color: MOSS }}>
            {dashboard.referrals.length === 0
              ? "No referrals yet. Share your link — the moment one comes in, you'll see it here."
              : "Your next referral lands here the moment it comes in."}
          </p>
        </section>

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
