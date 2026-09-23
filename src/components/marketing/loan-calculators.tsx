"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { calculateDscrRatio, estimatedMonthlyPI, estimatedMonthlyPitia } from "@/lib/term-sheet-calculations";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const SAND = "#CBB8A0";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
        {label}
      </span>
      <div className="mt-1.5 flex items-center rounded-sm border bg-white" style={{ borderColor: "rgba(30,30,30,0.2)" }}>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
          style={{ color: BASALT }}
        />
        {suffix && (
          <span className="pr-3 text-sm" style={{ color: MOSS }}>
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t py-2.5" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <span className="text-sm" style={{ color: BASALT }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: TEAL }}>
        {value}
      </span>
    </div>
  );
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type DscrTransactionType = "purchase" | "cashOutRefinance";

// What's actually quotable at each LTV, by transaction type — the slider's
// own min/max (50-85) covers the full range lenders will discuss, but not
// every point in that range is realistic, and the whole point of showing
// this is to stop someone from anchoring on an 85% cash-out refi that no
// lender actually offers.
function ltvGuidance(pct: number, transactionType: DscrTransactionType): { text: string; warn: boolean } {
  if (transactionType === "cashOutRefinance") {
    if (pct >= 85) return { text: "No lender currently offers an 85% LTV cash-out refinance — 75–80% is the realistic ceiling.", warn: true };
    if (pct >= 80) return { text: "80% is on the high end for a cash-out refinance — fewer lenders offer this than at 75%.", warn: true };
    return { text: "Most lenders offer up to 75–80% LTV on a cash-out refinance — you're within range.", warn: false };
  }
  if (pct >= 85) return { text: "Only a few lenders offer 85% LTV on a purchase — expect tighter credit, reserve, and experience requirements.", warn: true };
  if (pct >= 80) return { text: "80% is where most lenders cap DSCR purchase leverage.", warn: false };
  return { text: "Most lenders offer up to 80% LTV on a DSCR purchase — you're well within range.", warn: false };
}

function TransactionTypeToggle({
  value,
  onChange,
}: {
  value: DscrTransactionType;
  onChange: (v: DscrTransactionType) => void;
}) {
  const options: { value: DscrTransactionType; label: string }[] = [
    { value: "purchase", label: "Purchase" },
    { value: "cashOutRefinance", label: "Cash-Out Refinance" },
  ];
  return (
    <div className="inline-flex rounded-sm border" style={{ borderColor: "rgba(20,61,74,0.2)" }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: value === opt.value ? TEAL : "transparent",
            color: value === opt.value ? "#FAF7F2" : BASALT,
            borderLeft: i > 0 ? "1px solid rgba(20,61,74,0.2)" : undefined,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DscrCalculator() {
  const [rent, setRent] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [transactionType, setTransactionType] = useState<DscrTransactionType>("purchase");
  // 80% is what most lenders quote as their standard DSCR purchase/cash-out
  // ceiling — the sensible starting point, with the slider there to show
  // where 75% and 85% actually stand rather than making someone type a
  // percentage from scratch.
  const [ltvPct, setLtvPct] = useState(80);
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("30");
  const [taxes, setTaxes] = useState("");
  const [insurance, setInsurance] = useState("");
  const [hoa, setHoa] = useState("");

  const loanAmount = propertyValue ? num(propertyValue) * (ltvPct / 100) : 0;
  const monthlyPI = estimatedMonthlyPI(loanAmount, num(rate), num(term) || 30);
  const monthlyPitia = estimatedMonthlyPitia(monthlyPI, num(taxes) || null, num(insurance) || null, num(hoa) || null);
  const dscr = calculateDscrRatio(num(rent) || null, monthlyPitia);

  const hasInputs = propertyValue && rate && rent;
  const guidance = ltvGuidance(ltvPct, transactionType);

  return (
    <div className="rounded-sm border bg-white p-6 md:p-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <h3 className="text-lg font-medium" style={{ color: TEAL }}>
        DSCR Calculator
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BASALT }}>
        Debt Service Coverage Ratio compares a property&apos;s rental income to its total monthly payment. A DSCR
        of 1.0 or higher means the property&apos;s rent covers the debt itself — the core number a DSCR loan
        qualifies against instead of your personal income.
      </p>

      <div className="mt-6">
        <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
          Transaction Type
        </span>
        <div className="mt-1.5">
          <TransactionTypeToggle value={transactionType} onChange={setTransactionType} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={transactionType === "purchase" ? "Purchase Price" : "As-Is Value"}
          value={propertyValue}
          onChange={setPropertyValue}
          placeholder="300,000"
        />
        <Field label="Monthly Rental Income" value={rent} onChange={setRent} placeholder="2,500" />
        <Field label="Interest Rate" value={rate} onChange={setRate} suffix="%" placeholder="7.5" />
        <Field label="Loan Term" value={term} onChange={setTerm} suffix="years" placeholder="30" />
        <Field label="Annual Taxes" value={taxes} onChange={setTaxes} placeholder="3,600" />
        <Field label="Annual Insurance" value={insurance} onChange={setInsurance} placeholder="1,800" />
        <Field label="Annual HOA (optional)" value={hoa} onChange={setHoa} placeholder="0" />
      </div>

      <div className="mt-6 max-w-xs">
        <SliderField
          label="Loan-to-Value (LTV)"
          value={ltvPct}
          onChange={setLtvPct}
          min={50}
          max={85}
          caption={guidance.text}
          captionColor={guidance.warn ? "#B45309" : MOSS}
        />
      </div>

      {propertyValue && (
        <div
          className="mt-6 flex items-baseline justify-between rounded-sm p-4"
          style={{ backgroundColor: `${SAND}30` }}
        >
          <span className="text-sm font-medium" style={{ color: BASALT }}>
            Estimated Loan Amount ({ltvPct}% LTV)
          </span>
          <span className="text-xl font-medium" style={{ color: TEAL }}>
            {money(loanAmount)}
          </span>
        </div>
      )}

      {hasInputs && (
        <div className="mt-6">
          <ResultRow label="Monthly Principal & Interest" value={money(monthlyPI)} />
          <ResultRow label="Total Monthly Payment (PITIA)" value={money(monthlyPitia)} />
          <div className="flex items-baseline justify-between border-t py-3" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
            <span className="text-sm font-medium" style={{ color: BASALT }}>
              Your DSCR
            </span>
            <span className="text-2xl font-medium" style={{ color: TEAL }}>
              {dscr !== null ? dscr.toFixed(2) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  caption,
  captionColor = MOSS,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  caption: string;
  captionColor?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
          {label}
        </span>
        <span className="text-sm font-medium" style={{ color: TEAL }}>
          {value}%
        </span>
      </div>
      <div className="mt-3 max-w-xs">
        <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={5} />
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: captionColor }}>
        {caption}
      </p>
    </div>
  );
}

export function HardMoneyLeverageCalculator() {
  const [purchasePrice, setPurchasePrice] = useState("");
  const [rehabCost, setRehabCost] = useState("");
  const [arv, setArv] = useState("");
  // Most lenders cap ground-up/fix-and-flip leverage around 75% of ARV
  // regardless of experience — that's the number people actually quote, so
  // it's the sensible starting point rather than the slider's own midpoint.
  const [ltarvPct, setLtarvPct] = useState(75);
  // 80-85% is what a lender typically offers someone without a deep track
  // record; 90-100% is reserved for experienced borrowers. 85% is a
  // reasonable "average investor" default to start from.
  const [ltcPct, setLtcPct] = useState(85);

  const totalCost = purchasePrice ? num(purchasePrice) + num(rehabCost) : null;
  const maxByLtc = totalCost !== null ? totalCost * (ltcPct / 100) : null;
  const maxByLtarv = arv ? num(arv) * (ltarvPct / 100) : null;
  const hasInputs = purchasePrice && arv;

  let maxLoan: number | null = null;
  let binding: "LTC" | "LTARV" | null = null;
  if (maxByLtc !== null && maxByLtarv !== null) {
    if (maxByLtc <= maxByLtarv) {
      maxLoan = maxByLtc;
      binding = "LTC";
    } else {
      maxLoan = maxByLtarv;
      binding = "LTARV";
    }
  }

  return (
    <div className="rounded-sm border bg-white p-6 md:p-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <h3 className="text-lg font-medium" style={{ color: TEAL }}>
        Hard Money Leverage Calculator
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BASALT }}>
        A fix &amp; flip or ground-up construction loan is sized two ways at once — against total project cost
        (Loan-to-Cost) and against the finished value (Loan-to-ARV). A lender always offers the{" "}
        <span className="font-medium">lower</span> of the two, so seeing both side by side is what actually shows
        you what a lender will approve.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} placeholder="200,000" />
        <Field label="Rehab / Construction Budget" value={rehabCost} onChange={setRehabCost} placeholder="80,000" />
        <Field label="After-Repair Value (ARV)" value={arv} onChange={setArv} placeholder="400,000" />
      </div>

      <div className="mt-8 space-y-6">
        <SliderField
          label="Loan-to-After-Repair Value (LTARV)"
          value={ltarvPct}
          onChange={setLtarvPct}
          min={50}
          max={75}
          caption="Most lenders cap ground-up and fix & flip leverage at 75% of after-repair value, regardless of experience."
        />
        <SliderField
          label="Loan-to-Cost (LTC)"
          value={ltcPct}
          onChange={setLtcPct}
          min={80}
          max={100}
          caption="LTC is based on experience. You typically need a track record to qualify for 90% or 100% LTC — with less experience, expect somewhere between 80% and 85%."
        />
      </div>

      {hasInputs && (
        <div className="mt-8">
          <ResultRow label={`Max loan by LTARV (${ltarvPct}% of ARV)`} value={money(maxByLtarv ?? 0)} />
          <ResultRow label={`Max loan by LTC (${ltcPct}% of project cost)`} value={money(maxByLtc ?? 0)} />
          {maxLoan !== null && (
            <div className="mt-4 rounded-sm p-5" style={{ backgroundColor: `${SAND}30` }}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium" style={{ color: BASALT }}>
                  Your max loan amount
                </span>
                <span className="text-2xl font-medium" style={{ color: TEAL }}>
                  {money(maxLoan)}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MOSS }}>
                Limited by {binding === "LTC" ? "Loan-to-Cost (LTC)" : "Loan-to-After-Repair Value (LTARV)"} — a
                lender always uses whichever number is lower.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
