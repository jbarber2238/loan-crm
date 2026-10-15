import Link from "next/link";
import { requirePartner } from "@/server/partner/session";
import { getPartnerDashboard } from "@/server/partner/portal-data";
import { buildPartnerLinks } from "@/server/actions/referral-affiliates";
import { StageStepper } from "@/components/partner/stage-stepper";
import { CopyButton } from "@/components/partner/copy-button";
import { PARTNER_STAGE_LABELS } from "@/lib/partner-comp";

const TEAL = "#143D4A";
const MOSS = "#68735F";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-sm border bg-white p-4">
      <p className="text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: MOSS }}>
        {label}
      </p>
      <p className="mt-1 text-2xl tabular-nums" style={{ color: TEAL }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs" style={{ color: MOSS }}>{hint}</p>}
    </div>
  );
}

export default async function PartnerDashboardPage() {
  const partner = await requirePartner();
  const [dashboard, links] = await Promise.all([getPartnerDashboard(partner), buildPartnerLinks(partner)]);
  const needsPayment = dashboard.hasClosed || Boolean(partner.bankingRequestedAt);
  const missingBanking = !partner.bankingReceivedAt;
  const missingW9 = !partner.w9ReceivedAt;

  const pipeline =
    dashboard.pipelineLow === dashboard.pipelineHigh
      ? money(dashboard.pipelineLow)
      : `${money(dashboard.pipelineLow)}–${money(dashboard.pipelineHigh)}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-normal">Hi {(partner.name ?? "").split(/\s+/)[0] || "there"}</h1>
        <p className="mt-1 text-sm" style={{ color: MOSS }}>
          {partner.tier === 25 ? "Tier 2 partner — 25% of the broker fee on a referred borrower's first deal." : "20% of the broker fee on a referred borrower's first deal, 10% on their repeat deals for 24 months."}
        </p>
      </div>

      {needsPayment && (missingBanking || missingW9) && (
        <div className="rounded-sm border p-4" style={{ borderColor: TEAL, backgroundColor: "#FFFFFF" }}>
          <p className="font-medium">Your referral closed — add your payment details now</p>
          <p className="mt-1 text-sm">
            Your payout goes out by ACH within 5 business days of our fee arriving from title. Wires land in days; mailed checks can take 2–3 weeks.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">ACH info: {missingBanking ? "needed" : "received ✓"}</span>
            <span className="rounded-full border px-2.5 py-1">W-9: {missingW9 ? "needed" : "received ✓"}</span>
            <Link
              href="/partner/payment"
              className="ml-auto rounded-sm px-4 py-2 text-xs font-medium tracking-[0.14em] text-white uppercase"
              style={{ backgroundColor: TEAL }}
            >
              Add payment details
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Pipeline value to you" value={dashboard.inFlight ? pipeline : "$0"} hint={dashboard.inFlight ? "Estimated, on open referrals" : undefined} />
        <Stat label="Paid to date" value={money(dashboard.paidToDate)} hint={dashboard.awaitingPayout > 0 ? `${money(dashboard.awaitingPayout)} closed, awaiting payout` : undefined} />
        <Stat label="Referrals in flight" value={String(dashboard.inFlight)} />
      </div>

      <section className="rounded-sm border bg-white p-5">
        <h2 className="text-lg font-normal">Submit a referral</h2>
        <p className="mt-1 text-sm">
          Send a borrower your link and they fill out the request themselves, or open it and fill it out with them. Either way it&apos;s attributed to you automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {links?.shortLink && (
            <Link
              href={links.shortLink.replace(/^https?:\/\/[^/]+/, "")}
              className="rounded-sm px-5 py-3 text-xs font-medium tracking-[0.14em] text-white uppercase"
              style={{ backgroundColor: TEAL }}
            >
              Submit a referral
            </Link>
          )}
        </div>
        {links?.shortLink && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="rounded bg-[#FAF7F2] px-2 py-1 text-xs break-all">{links.shortLink}</code>
            <CopyButton text={links.shortLink} label="Copy my link" />
          </div>
        )}
        {links && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer underline underline-offset-4">Embed the form on your website</summary>
            <code className="mt-2 block rounded bg-[#FAF7F2] p-2 text-xs break-all">{links.embedSnippet}</code>
            <div className="mt-2">
              <CopyButton text={links.embedSnippet} label="Copy embed code" />
            </div>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-normal">Your referrals</h2>
        {dashboard.referrals.length === 0 ? (
          <div className="rounded-sm border bg-white p-6 text-center text-sm" style={{ color: MOSS }}>
            No referrals yet. Share your link above — the moment one comes in, you&apos;ll see it here.
          </div>
        ) : (
          dashboard.referrals.map((r) => (
            <article key={r.id} className="rounded-sm border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{r.borrower}</p>
                  <p className="text-xs" style={{ color: MOSS }}>
                    {r.city} · {r.dealType}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: MOSS }}>
                    {r.payoutStatus === "paid" ? "Paid" : "Your estimated payout"}
                  </p>
                  <p className="text-sm font-medium tabular-nums">{r.estimatedPayout}</p>
                  {r.stage === "closed" && r.payoutStatus !== "paid" && (
                    <p className="text-xs" style={{ color: MOSS }}>
                      {r.payoutStatus === "ready" ? "Ready — paying within 5 business days" : "Releases after our fee is received"}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <StageStepper stage={r.stage} paid={r.payoutStatus === "paid"} />
              </div>
              <p className="mt-2 text-xs" style={{ color: MOSS }}>
                {PARTNER_STAGE_LABELS[r.stage]}
                {r.payoutStatus === "paid" && r.paidDate ? ` · Paid ${r.paidDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
