"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, ResultRow, money, num } from "@/components/marketing/loan-calculators";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const SAND = "#CBB8A0";
const GOLD = "#C99A3D";
const TERRACOTTA = "#B4623B";
const SLATE = "#4F6B70";
const TAUPE = "#9C8564";
const PLUM = "#7A5548";
const GREEN = "#3F8F5C";
const RED = "#C1443A";
const AMBER = "#D69A3E";

function RangeSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  note,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  note?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
          {label}
        </span>
        <span className="text-sm font-semibold" style={{ color: TEAL }}>
          {format(value)}
        </span>
      </div>
      <div className="mt-3">
        <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} />
      </div>
      {note && (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: MOSS }}>
          {note}
        </p>
      )}
    </div>
  );
}

function SectionCard({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border bg-white p-6 shadow-[0_8px_24px_rgba(20,61,74,0.08)] md:p-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <div className="flex items-center gap-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: TEAL }}
        >
          {step}
        </span>
        <h3 className="text-lg font-medium" style={{ color: TEAL }}>
          {title}
        </h3>
      </div>
      {subtitle && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: BASALT }}>
          {subtitle}
        </p>
      )}
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

interface CostSegment {
  label: string;
  amount: number;
  color: string;
}

function CostStackBar({ segments, total }: { segments: CostSegment[]; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-sm">
        {segments
          .filter((s) => s.amount > 0)
          .map((s) => (
            <div
              key={s.label}
              style={{ width: `${Math.max((s.amount / safeTotal) * 100, 0.5)}%`, backgroundColor: s.color }}
              title={`${s.label}: ${money(s.amount)}`}
            />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs" style={{ color: BASALT }}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function marginZone(pct: number): { color: string; label: string } {
  if (pct < 10) return { color: RED, label: "Below target" };
  if (pct < 15) return { color: AMBER, label: "Getting close" };
  return { color: GREEN, label: "On target" };
}

function MarginGauge({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(Math.min(pct, 25), -5);
  const positionPct = ((clamped - -5) / (25 - -5)) * 100;
  const zone = marginZone(pct);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
          {label}
        </span>
        <span className="text-sm font-semibold" style={{ color: zone.color }}>
          {pct.toFixed(1)}% — {zone.label}
        </span>
      </div>
      <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: "rgba(20,61,74,0.1)" }}>
        <div className="absolute inset-y-0 left-0" style={{ width: "40%", backgroundColor: `${RED}55` }} />
        <div className="absolute inset-y-0" style={{ left: "40%", width: "16.7%", backgroundColor: `${AMBER}55` }} />
        <div className="absolute inset-y-0" style={{ left: "56.7%", width: "43.3%", backgroundColor: `${GREEN}55` }} />
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
          style={{ left: `${positionPct}%`, backgroundColor: zone.color }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: MOSS }}>
        <span>0%</span>
        <span>10%</span>
        <span>15%</span>
        <span>25%+</span>
      </div>
    </div>
  );
}

export function MaxOfferCalculator() {
  // --- Section 1: Max Allowable Offer ---
  const [arv, setArv] = useState("400000");
  const [rehabBudget, setRehabBudget] = useState("60000");
  const [offerPct, setOfferPct] = useState(70);

  const arvNum = num(arv);
  const rehabNum = num(rehabBudget);
  const mao = arvNum * (offerPct / 100) - rehabNum;

  // --- Section 2: Purchase Price & Leverage ---
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseEdited, setPurchaseEdited] = useState(false);
  const effectivePurchasePrice = purchaseEdited && purchasePrice !== "" ? num(purchasePrice) : mao;

  const [hasExperience, setHasExperience] = useState(false);
  const [ltcPct, setLtcPct] = useState(90);
  const [ltarvPct, setLtarvPct] = useState(75);

  const costBasis = Math.max(effectivePurchasePrice, 0) + rehabNum;
  const maxByLtc = costBasis * (ltcPct / 100);
  const maxByLtarv = arvNum * (ltarvPct / 100);
  const loanAmount = Math.max(Math.min(maxByLtc, maxByLtarv), 0);
  const bindingByLtarv = maxByLtarv <= maxByLtc;

  // --- Section 3: Carrying costs ---
  const [carryRatePct, setCarryRatePct] = useState(10.5);
  const [timelineMonths, setTimelineMonths] = useState(6);
  const totalInterest = loanAmount * (carryRatePct / 100) * (timelineMonths / 12);

  // --- Section 4: Holding costs ---
  const [annualTaxes, setAnnualTaxes] = useState("3600");
  const [annualInsurance, setAnnualInsurance] = useState("1500");
  const [monthlyMisc, setMonthlyMisc] = useState(150);
  const totalHolding = (num(annualTaxes) / 12 + num(annualInsurance) / 12 + monthlyMisc) * timelineMonths;

  // --- Section 5: Closing costs ---
  const [acqPct, setAcqPct] = useState(2);
  const [originationPts, setOriginationPts] = useState(2);
  const [dispoPct, setDispoPct] = useState(7);

  const acqCost = Math.max(effectivePurchasePrice, 0) * (acqPct / 100);
  const originationCost = loanAmount * (originationPts / 100);
  const dispoCost = arvNum * (dispoPct / 100);

  // --- Section 6: Profit ---
  const totalProjectCost = Math.max(effectivePurchasePrice, 0) + rehabNum + acqCost + originationCost + totalInterest + totalHolding;
  const saleProceeds = arvNum - dispoCost;
  const profit = saleProceeds - totalProjectCost;
  const profitMarginPct = arvNum > 0 ? (profit / arvNum) * 100 : 0;

  const [stressPct, setStressPct] = useState(0);
  const stressedArv = arvNum * (1 - stressPct / 100);
  const stressedDispoCost = stressedArv * (dispoPct / 100);
  const stressedProfit = stressedArv - stressedDispoCost - totalProjectCost;
  const stressedMarginPct = stressedArv > 0 ? (stressedProfit / stressedArv) * 100 : 0;

  const segments: CostSegment[] = [
    { label: "Purchase Price", amount: Math.max(effectivePurchasePrice, 0), color: TEAL },
    { label: "Rehab Budget", amount: rehabNum, color: GOLD },
    { label: "Acquisition Closing", amount: acqCost, color: TAUPE },
    { label: "Lender Points", amount: originationCost, color: SLATE },
    { label: "Carrying Interest", amount: totalInterest, color: TERRACOTTA },
    { label: "Holding Costs", amount: totalHolding, color: MOSS },
    { label: "Disposition Closing", amount: dispoCost, color: PLUM },
    { label: "Profit", amount: Math.max(profit, 0), color: GREEN },
  ];
  const stackTotal = Math.max(arvNum, totalProjectCost + dispoCost);

  return (
    <div className="space-y-6">
      <SectionCard
        step={1}
        title="Set Your Max Allowable Offer"
        subtitle="The 70% rule: most flippers won't pay more than 70% of a property's after-repair value, minus what it'll cost to fix it up. Slide the percentage to match your own risk tolerance."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="After-Repair Value (ARV)" value={arv} onChange={setArv} placeholder="400,000" />
          <Field label="Rehab Budget" value={rehabBudget} onChange={setRehabBudget} placeholder="60,000" />
        </div>
        <RangeSlider
          label="Percent of ARV"
          value={offerPct}
          onChange={setOfferPct}
          min={50}
          max={85}
          format={(v) => `${v}%`}
          note="70% is the classic flipper's rule of thumb — move it up in a hot, low-risk market or down for a heavier rehab."
        />
        <div className="rounded-sm p-5" style={{ backgroundColor: `${GOLD}22` }}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium" style={{ color: BASALT }}>
              Your Max Allowable Offer
            </span>
            <span className="text-2xl font-semibold" style={{ color: TEAL }}>
              {money(Math.max(mao, 0))}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MOSS }}>
            ({offerPct}% × {money(arvNum)} ARV) − {money(rehabNum)} rehab budget
          </p>
        </div>
      </SectionCard>

      <SectionCard
        step={2}
        title="Purchase Price & Leverage"
        subtitle="Starts from your Max Allowable Offer above — change it if you're negotiating a different number. Then see how much a lender will actually finance, by both Loan-to-Cost and Loan-to-ARV."
      >
        <div className="max-w-xs">
          <label className="block">
            <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
              Purchase Price
            </span>
            <div className="mt-1.5 flex items-center rounded-sm border bg-white" style={{ borderColor: "rgba(30,30,30,0.2)" }}>
              <input
                type="number"
                inputMode="decimal"
                value={purchaseEdited ? purchasePrice : Math.max(mao, 0).toFixed(0)}
                onChange={(e) => {
                  setPurchaseEdited(true);
                  setPurchasePrice(e.target.value);
                }}
                className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                style={{ color: BASALT }}
              />
            </div>
          </label>
          {purchaseEdited && (
            <button
              type="button"
              onClick={() => {
                setPurchaseEdited(false);
                setPurchasePrice("");
              }}
              className="mt-1.5 text-xs font-medium underline"
              style={{ color: MOSS }}
            >
              Reset to Max Allowable Offer
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: BASALT }}>
          <Checkbox checked={hasExperience} onCheckedChange={(v) => setHasExperience(v === true)} />
          I have completed at least one prior fix &amp; flip
        </label>

        <RangeSlider
          label="Loan-to-Cost (LTC)"
          value={ltcPct}
          onChange={setLtcPct}
          min={hasExperience ? 70 : 70}
          max={hasExperience ? 100 : 90}
          format={(v) => `${v}%`}
          note={
            hasExperience
              ? "With prior experience, lenders will go up to 100% LTC — but only as long as the loan still stays within 75% of ARV."
              : "Without prior fix & flip experience, 90% LTC is the typical ceiling."
          }
        />
        <RangeSlider
          label="Loan-to-After-Repair Value (LTARV)"
          value={ltarvPct}
          onChange={setLtarvPct}
          min={50}
          max={75}
          format={(v) => `${v}%`}
          note="75% of ARV is the hard ceiling almost every hard money lender holds to, regardless of experience."
        />

        <div className="rounded-sm p-5" style={{ backgroundColor: `${SAND}30` }}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium" style={{ color: BASALT }}>
              Estimated Loan Amount
            </span>
            <span className="text-2xl font-semibold" style={{ color: TEAL }}>
              {money(loanAmount)}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MOSS }}>
            Limited by {bindingByLtarv ? "Loan-to-After-Repair Value (LTARV)" : "Loan-to-Cost (LTC)"} — a lender
            always uses whichever number is lower.
          </p>
        </div>
      </SectionCard>

      <SectionCard step={3} title="Carrying Costs (Debt)" subtitle="Simple interest on your loan amount, for as long as you expect to hold the project.">
        <RangeSlider
          label="Annual Interest Rate"
          value={carryRatePct}
          onChange={setCarryRatePct}
          min={9.5}
          max={12}
          step={0.25}
          format={(v) => `${v.toFixed(2)}%`}
          note="Typical range for fix & flip bridge debt is 9.5%–12% simple interest."
        />
        <div className="max-w-xs">
          <Field
            label="Estimated Project Timeline (months)"
            value={String(timelineMonths)}
            onChange={(v) => setTimelineMonths(num(v))}
            suffix="mo"
            placeholder="6"
          />
        </div>
        <ResultRow label={`Total Interest (${carryRatePct.toFixed(2)}% for ${timelineMonths} mo)`} value={money(totalInterest)} />
      </SectionCard>

      <SectionCard
        step={4}
        title="Holding Costs (Property)"
        subtitle="Taxes and insurance, prorated over your timeline, plus a rough monthly allowance for utilities, HOA, lawn care, and snow removal."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Annual Property Taxes" value={annualTaxes} onChange={setAnnualTaxes} placeholder="3,600" />
          <Field label="Annual Insurance" value={annualInsurance} onChange={setAnnualInsurance} placeholder="1,500" />
        </div>
        <RangeSlider
          label="Monthly Misc. Holding Costs"
          value={monthlyMisc}
          onChange={setMonthlyMisc}
          min={50}
          max={400}
          step={10}
          format={(v) => money(v) + "/mo"}
          note="Covers utilities, HOA dues, lawn care, and snow removal in one rough monthly estimate."
        />
        <ResultRow label={`Total Holding Costs (${timelineMonths} mo)`} value={money(totalHolding)} />
      </SectionCard>

      <SectionCard step={5} title="Closing Costs" subtitle="One-time costs on the way in and the way out of the deal.">
        <RangeSlider
          label="Acquisition Closing Costs"
          value={acqPct}
          onChange={setAcqPct}
          min={1}
          max={5}
          step={0.5}
          format={(v) => `${v}%`}
          note="Excludes lender points. Use 1–2% for an off-market deal, 3–5% for one bought on the MLS."
        />
        <RangeSlider
          label="Lender Origination Points"
          value={originationPts}
          onChange={setOriginationPts}
          min={2}
          max={5}
          step={0.5}
          format={(v) => `${v} pts`}
          note="Standard broker points on hard money debt typically start around 2 and run up to 5."
        />
        <RangeSlider
          label="Disposition Closing Costs"
          value={dispoPct}
          onChange={setDispoPct}
          min={3}
          max={8}
          step={0.5}
          format={(v) => `${v}%`}
          note="Includes realtor commissions & seller fees. Can run as low as 3% with a single agent on both sides, or if you're a licensed agent yourself."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ResultRow label="Acquisition Costs" value={money(acqCost)} />
          <ResultRow label="Lender Points" value={money(originationCost)} />
          <ResultRow label="Disposition Costs" value={money(dispoCost)} />
        </div>
      </SectionCard>

      <SectionCard step={6} title="Profit & Margin" subtitle="Where every dollar of your after-repair value goes, and what's left over for you.">
        <CostStackBar segments={segments} total={stackTotal} />

        <div
          className="rounded-sm p-5"
          style={{ backgroundColor: profit >= 0 ? `${GREEN}18` : `${RED}18` }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium" style={{ color: BASALT }}>
              Projected Profit
            </span>
            <span className="text-2xl font-semibold" style={{ color: profit >= 0 ? GREEN : RED }}>
              {money(profit)}
            </span>
          </div>
        </div>

        <MarginGauge pct={profitMarginPct} label="Profit Margin (% of ARV) — target 15–20%" />

        <div>
          <RangeSlider
            label="ARV Stress Test — what if the sale price comes in lower?"
            value={stressPct}
            onChange={setStressPct}
            min={0}
            max={15}
            step={5}
            format={(v) => (v === 0 ? "No change" : `−${v}% ARV`)}
          />
          {stressPct > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ResultRow label={`Profit at −${stressPct}% ARV`} value={money(stressedProfit)} />
              <ResultRow label={`Margin at −${stressPct}% ARV`} value={`${stressedMarginPct.toFixed(1)}%`} />
            </div>
          )}
        </div>
      </SectionCard>

      <p className="text-xs leading-relaxed" style={{ color: MOSS }}>
        This tool is for planning purposes only and is not a quote, pre-qualification, or commitment to lend.
        Actual leverage, rate, and costs depend on underwriting.
      </p>
    </div>
  );
}
