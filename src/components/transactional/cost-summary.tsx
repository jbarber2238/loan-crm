import { formatMoney } from "@/lib/transactional-shared";
import { publicCost, STANDARD_RANGE_MAX, MINIMUM_FUNDING_AMOUNT } from "@/lib/transactional-fees";

const money0 = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The borrower's total cost for a funding amount — computed from exactly what
 * they enter, so it's their cost, not an estimate. Dark panel on the request
 * form, light on the pricing page's calculator.
 */
export function CostSummary({
  amount,
  sameDay,
  tone,
  sameDayNote,
}: {
  amount: number | null;
  sameDay: boolean;
  tone: "dark" | "light";
  sameDayNote?: string;
}) {
  const cost = publicCost(amount, sameDay);
  const dark = tone === "dark";
  const text = dark ? "#FAF7F2" : "#1E1E1E";
  const muted = dark ? "rgba(250,247,242,0.72)" : "#68735F";
  const accent = dark ? "#CBB8A0" : "#143D4A";

  return (
    <div
      className="rounded-sm p-5"
      style={{
        backgroundColor: dark ? "#143D4A" : "#FFFFFF",
        color: text,
        border: dark ? "none" : "1px solid rgba(20,61,74,0.18)",
      }}
      aria-live="polite"
    >
      <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: accent }}>
        Your cost
      </p>

      {cost.kind === "standard" ? (
        <>
          <p className="mt-2 text-4xl tabular-nums">{formatMoney(cost.totalFee)}</p>
          <p className="mt-1 text-sm" style={{ color: muted }}>
            {cost.totalPoints.toFixed(2)}% of {money0(amount ?? 0)}
            {sameDay ? " · includes same-day funding (+0.25%)" : ""}
          </p>
          {sameDay && sameDayNote && (
            <p className="mt-2 text-xs" style={{ color: muted }}>
              {sameDayNote}
            </p>
          )}
        </>
      ) : cost.kind === "custom" ? (
        <p className="mt-2 text-sm leading-relaxed">
          Funding above {money0(STANDARD_RANGE_MAX)} requires custom pricing. Submit your request and we&apos;ll contact
          you to run through the pricing with you.
        </p>
      ) : cost.kind === "below_minimum" ? (
        <p className="mt-2 text-sm leading-relaxed">
          The minimum funding amount is {money0(MINIMUM_FUNDING_AMOUNT)}.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed">Enter a funding amount to see your total cost.</p>
      )}

      <p className="mt-4 border-t pt-3 text-xs leading-relaxed" style={{ color: muted, borderColor: dark ? "rgba(250,247,242,0.2)" : "rgba(20,61,74,0.15)" }}>
        Pricing: 1.25% for $100,000–$499,999 and 1.00% for $500,000–$1,000,000. Same-day funding adds 0.25%.
      </p>
    </div>
  );
}
