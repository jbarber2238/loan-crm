"use client";

import { useState } from "react";
import type { PortalReferral } from "@/server/partner/portal-data";
import { BUCKET_LABELS, PROGRESS_STEPS, stageProgress, viewFor, type ReferralView } from "@/lib/partner-dashboard";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const TAN = "#CBB8A0";
const RULE = "rgba(203,184,160,0.7)";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Four boxes that fill in as the loan moves along, with the current step's name underneath. */
function StageProgressBar({ bucket }: { bucket: PortalReferral["bucket"] }) {
  const { filled, state } = stageProgress(bucket);
  const color = state === "funded" ? MOSS : TEAL;
  return (
    <div className="w-36">
      <div className="flex gap-1" role="img" aria-label={`${BUCKET_LABELS[bucket]}: step ${filled} of ${PROGRESS_STEPS.length}`}>
        {PROGRESS_STEPS.map((step, i) => (
          <span
            key={step}
            className="h-2 flex-1"
            style={{
              backgroundColor: i < filled ? color : "transparent",
              border: `1px solid ${i < filled ? color : state === "stopped" ? "#C9C9C2" : TAN}`,
              opacity: i === filled - 1 && state === "moving" ? 1 : i < filled ? 0.85 : 1,
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs" style={{ color: state === "stopped" ? "#8A8A84" : color }}>
        {BUCKET_LABELS[bucket]}
      </p>
    </div>
  );
}

const TABS: { key: ReferralView; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "funded", label: "Funded" },
  { key: "stopped", label: "Didn't proceed" },
];

export function ReferralsPanel({
  referrals,
  bucketCounts,
  fundedCount,
  initialView,
}: {
  initialView?: ReferralView;
  referrals: PortalReferral[];
  bucketCounts: Record<"submitted" | "review" | "closing" | "funded", number>;
  fundedCount: number;
}) {
  const counts: Record<ReferralView, number> = { active: 0, funded: 0, stopped: 0 };
  for (const r of referrals) counts[viewFor(r.bucket)]++;
  // Open on Active, unless there's nothing active and something funded.
  const [view, setView] = useState<ReferralView>(initialView ?? (counts.active === 0 && counts.funded > 0 ? "funded" : "active"));
  const tabs = TABS.filter((t) => t.key !== "stopped" || counts.stopped > 0);
  const shown = referrals.filter((r) => viewFor(r.bucket) === view);

  const steps = [
    ["submitted", "01"],
    ["review", "02"],
    ["closing", "03"],
    ["funded", "04"],
  ] as const;
  const barColor = { submitted: TAN, review: TAN, closing: TEAL, funded: MOSS };

  return (
    <section className="border bg-white p-5" style={{ borderColor: RULE }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color: MOSS }}>
          Your referrals
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden text-xs sm:block" style={{ color: MOSS }}>
            {referrals.length} referral{referrals.length === 1 ? "" : "s"}, {fundedCount} funded
          </p>
          <div role="tablist" aria-label="Which referrals to show" className="flex border" style={{ borderColor: RULE }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={view === t.key}
                onClick={() => setView(t.key)}
                className="px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase"
                style={view === t.key ? { backgroundColor: TEAL, color: "#FAF7F2" } : { color: TEAL }}
              >
                {t.label} ({counts[t.key]})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map(([key, n]) => (
          <div key={key}>
            <div className="h-[3px]" style={{ backgroundColor: barColor[key] }} />
            <p className="mt-2 text-4xl font-normal tabular-nums" style={{ color: key === "submitted" ? MOSS : TEAL }}>
              {bucketCounts[key]}
            </p>
            <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color: MOSS }}>
              {n} {BUCKET_LABELS[key]}
            </p>
          </div>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.18em] uppercase" style={{ color: MOSS }}>
                <th className="pb-2 font-normal">Borrower &amp; property</th>
                <th className="pb-2 font-normal">Loan type</th>
                <th className="pb-2 font-normal">Loan amount</th>
                <th className="pb-2 font-normal">Progress</th>
                <th className="pb-2 text-right font-normal">Your payout</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t align-middle" style={{ borderColor: RULE }}>
                  <td className="py-3 pr-4">
                    <p className="font-medium">{r.borrower}</p>
                    <p className="text-xs" style={{ color: MOSS }}>
                      {r.address}
                    </p>
                  </td>
                  <td className="py-3 pr-4">{r.loanType}</td>
                  <td className="py-3 pr-4">
                    <p className="tabular-nums">{r.loanAmount ? money(r.loanAmount) : "—"}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <StageProgressBar bucket={r.bucket} />
                  </td>
                  <td className="py-3 text-right">
                    <p className="text-lg whitespace-nowrap tabular-nums" style={{ color: r.payoutStatus === "paid" ? MOSS : TEAL }}>
                      {r.payoutText}
                    </p>
                    <p className="ml-auto max-w-[9.5rem] text-[11px] leading-snug" style={{ color: MOSS }}>
                      {r.payoutNote}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-sm" style={{ color: MOSS }}>
          {view === "funded"
            ? "No funded deals yet. When one closes, it moves here with its payout."
            : view === "stopped"
              ? "Nothing here."
              : referrals.length === 0
                ? "No referrals yet. Share your link — the moment one comes in, you'll see it here."
                : "No active deals right now."}
        </p>
      )}
      <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: RULE, color: MOSS }}>
        Your next referral lands here the moment it comes in.
      </p>
    </section>
  );
}
