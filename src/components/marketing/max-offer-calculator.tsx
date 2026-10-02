"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { ActionForm, useFormPending } from "@/components/forms/action-form";
import { money } from "@/components/marketing/loan-calculators";
import { downloadMaxOfferExcel } from "@/lib/max-offer-excel-export";
import { calculate, offerVsMax, status, stressTest, type MaxOfferCalcInputs, type MarginStatus } from "@/lib/max-offer-calc";
import { APPLY_PATH } from "@/lib/lead-constants";
import {
  logCalculatorUsed,
  logExcelDownloaded,
  logCtaClicked,
  submitDealQuestions,
  submitLead,
  sendMaxOfferExcelEmailAction,
  type CtaTier,
} from "@/server/actions/leads";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const SAND = "#CBB8A0";
const GOLD = "#C99A3D";
const GREEN = "#3F8F5C";
const RED = "#C1443A";
const AMBER = "#D69A3E";
const OFF_WHITE = "#FAF7F2";

const STATUS_STYLE: Record<MarginStatus, { label: string; text: string; fg: string; bg: string }> = {
  on_target: { label: "On target", text: "This deal pencils.", fg: GREEN, bg: `${GREEN}22` },
  thin: { label: "Thin", text: "Tight. Try a lower price or a smaller rehab.", fg: AMBER, bg: `${AMBER}22` },
  below_target: { label: "Below target", text: "This deal does not pencil at this price.", fg: RED, bg: `${RED}22` },
};

// Tolerant numeric parsing — strips everything but digits and a decimal
// point, so a comma-formatted value, a stray "$", or a half-typed/empty
// field all resolve to a safe number instead of NaN.
function toNum(v: string): number {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const LOAN_OFFICER_PHONE_COPY = "269-267-7506";

// --- Small building blocks -------------------------------------------------

function InfoButton({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={open}
      className="flex size-11 shrink-0 -my-3 -mr-3 items-center justify-center text-[color:var(--moss)]"
      style={{ color: MOSS }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 7.2v4" />
        <path d="M8 4.8v.1" />
      </svg>
    </button>
  );
}

function Tip({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div role="status" className="flex items-center justify-between gap-2 rounded-sm p-3" style={{ backgroundColor: `${SAND}40` }}>
      <p className="text-xs leading-relaxed" style={{ color: BASALT }}>
        {text}
      </p>
      <button type="button" onClick={onClose} className="shrink-0 min-h-11 px-2 text-xs font-bold underline" style={{ color: TEAL }}>
        Got it
      </button>
    </div>
  );
}

interface InputMeta {
  key: string;
  label: string;
  prefix?: string;
  suffix?: string;
  tip: string;
  money?: boolean;
}

function LabeledInput({
  meta,
  value,
  onChange,
  onBlur,
  tipOpen,
  onToggleTip,
}: {
  meta: InputMeta;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  tipOpen: boolean;
  onToggleTip: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between">
        <label htmlFor={`f-${meta.key}`} className="text-xs font-semibold tracking-wide" style={{ color: MOSS }}>
          {meta.label}
        </label>
        <InfoButton label={`About ${meta.label}`} open={tipOpen} onToggle={onToggleTip} />
      </div>
      <div className="flex h-12 items-center gap-1 rounded-md border bg-white px-3" style={{ borderColor: "#CFC7B4" }}>
        {meta.prefix && (
          <span className="text-base" style={{ color: MOSS }}>
            {meta.prefix}
          </span>
        )}
        <input
          id={`f-${meta.key}`}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full min-w-0 grow bg-transparent text-[17px] font-semibold tabular-nums outline-none"
          style={{ color: TEAL }}
        />
        {meta.suffix && (
          <span className="text-sm" style={{ color: MOSS }}>
            {meta.suffix}
          </span>
        )}
      </div>
      {tipOpen && <Tip text={meta.tip} onClose={onToggleTip} />}
    </div>
  );
}

function MarginMeter({ margin }: { margin: number }) {
  const pct = margin * 100;
  const markerLeft = `${Math.max(0, Math.min(1, pct / 25)) * 100}%`;
  return (
    <div className="mt-3.5">
      <div className="relative">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <div style={{ width: "40%", backgroundColor: "#D9776B" }} />
          <div style={{ width: "20%", backgroundColor: "#E6CF9C" }} />
          <div style={{ width: "40%", backgroundColor: "#7FC49A" }} />
        </div>
        <div
          className="absolute top-[-3px] size-4 -translate-x-1/2 rounded-full border-2 border-white"
          style={{ left: markerLeft, backgroundColor: "#FFFFFF", boxShadow: `0 0 0 2px ${TEAL}` }}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px]" style={{ color: "rgba(250,247,242,0.75)" }}>
        <span className="absolute left-0">0%</span>
        <span className="absolute left-[40%] -ml-3">10%</span>
        <span className="absolute left-[60%] -ml-3">15%</span>
        <span className="absolute right-0">25%+</span>
      </div>
    </div>
  );
}

// --- Primary + advanced field metadata --------------------------------------

const TIPS = {
  arv: "After-repair value: what the property should sell for once the rehab is finished. Use recent comps.",
  rehab: "Your full renovation budget. Add a cushion for surprises.",
  months: "Months from closing to sale. Interest and holding costs run for this long.",
  rate: "A planning placeholder. Fix and flip bridge debt often runs 9.5%–12% simple interest, but real rates depend on the lender and the borrower.",
  pctOfArv: "The 70% rule: most flippers will not pay more than 70% of ARV minus rehab. Move it up in a hot, low-risk market or down for a heavier rehab.",
  ltc: "Loan-to-cost. Without prior experience, typically 80%–90% depending on the lender. With experience, some options go up to 100%.",
  annualTaxes: "Annual property taxes, prorated over your timeline.",
  annualInsurance: "Annual insurance premium, prorated over your timeline.",
  misc: "Utilities, HOA dues, lawn care and snow removal in one rough monthly number.",
  acq: "Closing costs on the way in, excluding lender points. Use 1–2% for off-market deals, 3–7% for MLS deals.",
  points: "A planning placeholder. Lender points vary a lot by lender and borrower.",
  sell: "Costs on the way out: realtor commissions and seller fees. As low as 3% with one agent, up to 7% with two.",
} as const;

type FieldKey = keyof typeof TIPS;

const PRIMARY_META: InputMeta[] = [
  { key: "arv", label: "After-repair value (ARV)", prefix: "$", tip: TIPS.arv, money: true },
  { key: "rehab", label: "Rehab budget", prefix: "$", tip: TIPS.rehab, money: true },
  { key: "pctOfArv", label: "Percent of ARV", suffix: "%", tip: TIPS.pctOfArv },
  { key: "months", label: "Months to sell", suffix: "mo", tip: TIPS.months },
];

const ADVANCED_META: InputMeta[] = [
  { key: "rate", label: "Interest rate (placeholder)", suffix: "%", tip: TIPS.rate },
  { key: "ltc", label: "Loan-to-cost", suffix: "%", tip: TIPS.ltc },
  { key: "annualTaxes", label: "Annual property taxes", prefix: "$", tip: TIPS.annualTaxes, money: true },
  { key: "annualInsurance", label: "Annual insurance", prefix: "$", tip: TIPS.annualInsurance, money: true },
  { key: "misc", label: "Misc. holding / mo", prefix: "$", tip: TIPS.misc, money: true },
  { key: "acq", label: "Buying closing costs", suffix: "%", tip: TIPS.acq },
  { key: "points", label: "Lender points (placeholder)", suffix: "pts", tip: TIPS.points },
  { key: "sell", label: "Selling costs", suffix: "%", tip: TIPS.sell },
];

interface RawInputs {
  arv: string;
  rehab: string;
  pctOfArv: string;
  months: string;
  rate: string;
  ltc: string;
  annualTaxes: string;
  annualInsurance: string;
  misc: string;
  acq: string;
  points: string;
  sell: string;
  offer: string;
}

const DEFAULT_RAW: RawInputs = {
  arv: "400,000",
  rehab: "60,000",
  pctOfArv: "70",
  months: "6",
  rate: "10.5",
  ltc: "90",
  annualTaxes: "3,600",
  annualInsurance: "1,500",
  misc: "150",
  acq: "2",
  points: "2",
  sell: "7",
  offer: "",
};

function toCalcInputs(raw: RawInputs): MaxOfferCalcInputs {
  return {
    arv: toNum(raw.arv),
    rehab: toNum(raw.rehab),
    pctOfArv: toNum(raw.pctOfArv) / 100,
    months: toNum(raw.months),
    rate: toNum(raw.rate) / 100,
    ltc: toNum(raw.ltc) / 100,
    annualTaxes: toNum(raw.annualTaxes),
    annualInsurance: toNum(raw.annualInsurance),
    miscPerMonth: toNum(raw.misc),
    acqPct: toNum(raw.acq) / 100,
    pointsPct: toNum(raw.points) / 100,
    sellPct: toNum(raw.sell) / 100,
    offer: raw.offer.trim() === "" ? null : toNum(raw.offer),
  };
}

// --- Lender panel, breakdown bars, stress test ------------------------------

function LenderPanel({ loan, limitedBy, cashIn, arv, scenarioLabel, onCtaClick }: {
  loan: number;
  limitedBy: string;
  cashIn: number;
  arv: number;
  scenarioLabel: string;
  onCtaClick: () => void;
}) {
  const ltarvOfActual = arv > 0 ? loan / arv : 0;
  return (
    <section aria-label="How much could you borrow" className="rounded-md border bg-white p-6 md:p-7" style={{ borderColor: "#E2DCCD" }}>
      <h2 className="font-serif text-xl font-medium" style={{ color: TEAL, fontFamily: "var(--font-archivo), Archivo, serif" }}>
        How much could you borrow?
      </h2>
      <p className="mt-1 text-sm" style={{ color: MOSS }}>
        Under qualifying circumstances, you could potentially get up to:
      </p>
      <div className="mt-3.5 rounded-sm p-4" style={{ backgroundColor: `${SAND}40` }}>
        <div className="text-xs font-bold tracking-wide" style={{ color: MOSS }}>
          UP TO
        </div>
        <div className="text-[40px] leading-[1.1] font-semibold tabular-nums" style={{ color: TEAL }}>
          {money(loan)}
        </div>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: MOSS }}>
          Based on buying at {scenarioLabel}. Limited by {limitedBy}, at {(ltarvOfActual * 100).toFixed(1)}% of ARV. You would
          put in about {money(cashIn)}.
        </p>
      </div>
      <div className="mt-4 text-xs font-bold tracking-wide" style={{ color: MOSS }}>
        WHAT DECIDES YOUR ACTUAL TERMS
      </div>
      <ul className="mt-1.5 list-disc space-y-1 pl-[18px] text-sm leading-relaxed" style={{ color: BASALT }}>
        <li>Your credit score (FICO)</li>
        <li>The flips you have completed</li>
        <li>The lender and program you choose. Rates and points vary.</li>
        <li>The property and your plan</li>
      </ul>
      <p className="mt-3 rounded-sm p-2.5 text-xs leading-relaxed" style={{ backgroundColor: OFF_WHITE, color: BASALT }}>
        This is not a quote, pre-qualification or commitment to lend. All loans are subject to underwriting and
        verification of experience.
      </p>
      <Link
        href={APPLY_PATH}
        onClick={onCtaClick}
        className="mt-3 flex h-13 items-center justify-center rounded-sm text-base font-bold transition-opacity hover:opacity-90"
        style={{ backgroundColor: GOLD, color: BASALT }}
      >
        See what you qualify for
      </Link>
    </section>
  );
}

function CashInvestedPanel({
  costRows,
  totalCost,
  loan,
  cashToClose,
  cashIn,
  cashOnCash,
  scenarioLabel,
}: {
  costRows: { label: string; amount: number }[];
  totalCost: number;
  loan: number;
  cashToClose: number;
  cashIn: number;
  cashOnCash: number;
  scenarioLabel: string;
}) {
  return (
    <section aria-label="Total cash invested" className="rounded-md border bg-white p-6 md:p-7" style={{ borderColor: "#E2DCCD" }}>
      <h2 className="font-serif text-xl font-medium" style={{ color: TEAL, fontFamily: "var(--font-archivo), Archivo, serif" }}>
        Total cash invested
      </h2>
      <p className="mt-1 text-sm" style={{ color: MOSS }}>
        Based on buying at {scenarioLabel} — everything you&rsquo;d put in over the life of this deal, after the loan, is
        what cash-on-cash return below is measured against.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-sm p-4" style={{ backgroundColor: `${SAND}40` }}>
          <div className="text-xs font-bold tracking-wide" style={{ color: MOSS }}>
            TOTAL CASH INVESTED
          </div>
          <div className="text-[36px] leading-[1.1] font-semibold tabular-nums" style={{ color: TEAL }}>
            {money(cashIn)}
          </div>
        </div>
        <div className="rounded-sm p-4" style={{ backgroundColor: `${GREEN}18` }}>
          <div className="text-xs font-bold tracking-wide" style={{ color: MOSS }}>
            PROJECTED CASH-ON-CASH RETURN
          </div>
          <div className="text-[36px] leading-[1.1] font-semibold tabular-nums" style={{ color: GREEN }}>
            {(cashOnCash * 100).toFixed(1)}%
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: MOSS }}>
        Not a quote or commitment to lend.
      </p>

      <div className="mt-4 flex flex-col text-xs" style={{ color: MOSS }}>
        {costRows.map((r) => (
          <div key={r.label} className="flex justify-between border-t py-1.5" style={{ borderColor: "#E2DCCD" }}>
            <span>{r.label}</span>
            <span className="tabular-nums">{money(r.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t py-1.5 font-semibold" style={{ borderColor: "#E2DCCD", color: BASALT }}>
          <span>Total project cost</span>
          <span className="tabular-nums">{money(totalCost)}</span>
        </div>
        <div className="flex justify-between border-t py-1.5" style={{ borderColor: "#E2DCCD" }}>
          <span>Less: loan proceeds (up to)</span>
          <span className="tabular-nums">&minus;{money(loan)}</span>
        </div>
        <div className="flex justify-between border-t py-1.5" style={{ borderColor: "#E2DCCD" }}>
          <span>Cash to close</span>
          <span className="tabular-nums">{money(cashToClose)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: MOSS }}>
        Cash to close assumes the loan is drawn against the purchase price first, with rehab released in draws
        later — not due at this closing. Your actual split depends on the lender.
      </p>
    </section>
  );
}

function BreakdownBars({ rows, arv, scenarioLabel }: { rows: { label: string; amount: number; color: string; bold?: boolean }[]; arv: number; scenarioLabel: string }) {
  return (
    <section aria-label="Where every dollar goes" className="rounded-md border bg-white p-6 md:p-7" style={{ borderColor: "#E2DCCD" }}>
      <h2 className="text-xl font-medium" style={{ color: TEAL }}>
        Where every dollar goes
      </h2>
      <p className="mt-1 mb-3 text-xs" style={{ color: MOSS }}>
        Bars show each item as a share of ARV, based on buying at {scenarioLabel}.
      </p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const widthPct = arv > 0 ? Math.max(0, Math.min(100, (r.amount / arv) * 100)) : 0;
          return (
            <div key={r.label}>
              <div className="flex justify-between text-sm" style={{ fontWeight: r.bold ? 700 : 500, color: BASALT }}>
                <span>{r.label}</span>
                <span className="tabular-nums">{money(r.amount)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full" style={{ backgroundColor: "#EFE9DB" }}>
                <div className="h-2 rounded-full" style={{ width: `${widthPct}%`, backgroundColor: r.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StressList({ points, scenarioLabel }: { points: ReturnType<typeof stressTest>; scenarioLabel: string }) {
  return (
    <section aria-label="If the sale price comes in lower" className="rounded-md border bg-white p-6 md:p-7" style={{ borderColor: "#E2DCCD" }}>
      <h2 className="text-xl font-medium" style={{ color: TEAL }}>
        If the sale price comes in lower
      </h2>
      <p className="mt-1 mb-1 text-xs" style={{ color: MOSS }}>
        Based on buying at {scenarioLabel}. Costs stay the same; only the sale price moves.
      </p>
      <div className="flex flex-col">
        {points.map((p) => {
          const st = STATUS_STYLE[status(p.margin)];
          return (
            <div
              key={p.drop}
              className="flex items-center justify-between gap-2 border-t py-2.5"
              style={{ borderColor: "#E2DCCD" }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: BASALT }}>
                  {p.drop === 0 ? "As planned" : `Sale price ${Math.round(p.drop * 100)}% lower`}
                </div>
                <div className="text-xs tabular-nums" style={{ color: MOSS }}>
                  Sells for {money(p.salePrice)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-bold tabular-nums" style={{ color: BASALT }}>
                  {money(p.profit)}
                </div>
                <div
                  className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ backgroundColor: st.bg, color: st.fg }}
                >
                  {(p.margin * 100).toFixed(1)}% {st.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Excel-download gate -----------------------------------------------------

const CLOSING_TIMELINE_OPTIONS: { label: string; days: number }[] = [
  { label: "0–30 days", days: 15 },
  { label: "31–60 days", days: 45 },
  { label: "61–90 days", days: 75 },
  { label: "90+ days", days: 120 },
];

function ChipRow<T extends string>({ options, value, onChange }: { options: T[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className="h-11 rounded-sm border px-4 text-sm font-semibold transition-colors"
          style={{
            borderColor: TEAL,
            backgroundColor: value === opt ? TEAL : "#FFFFFF",
            color: value === opt ? OFF_WHITE : TEAL,
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ExcelGateSubmit() {
  const pending = useFormPending();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-13 w-full items-center justify-center gap-2 rounded-sm text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ backgroundColor: GOLD, color: BASALT }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? "Preparing your file…" : "Email me the Excel"}
    </button>
  );
}

function ExcelGateForm({ onSubmitted }: { onSubmitted: (leadId: string, dealUnderContract: boolean | null, timeline: string | null, timelineDays: number | null) => void }) {
  const [dealUnderContract, setDealUnderContract] = useState<"Yes" | "No" | null>(null);
  const [timeline, setTimeline] = useState<string | null>(null);

  async function action(formData: FormData) {
    const { leadId } = await submitLead("max_allowable_offer_calculator", formData);
    const match = CLOSING_TIMELINE_OPTIONS.find((o) => o.label === timeline);
    onSubmitted(leadId, dealUnderContract === null ? null : dealUnderContract === "Yes", timeline, match?.days ?? null);
  }

  return (
    <div className="rounded-md p-6 md:p-8" style={{ backgroundColor: "#EDE4D2" }}>
      <h2 className="text-2xl font-medium" style={{ color: TEAL }}>
        Where should we send it?
      </h2>
      <p className="mt-1 mb-5 text-sm" style={{ color: BASALT }}>
        The Excel file arrives with this deal already filled in.
      </p>
      <ActionForm action={action} className="flex flex-col gap-4">
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="gate-website">Website</label>
          <input id="gate-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: BASALT }}>
              First name
            </span>
            <input
              name="name"
              type="text"
              required
              autoComplete="given-name"
              className="h-12 rounded-sm border bg-white px-3 text-base outline-none"
              style={{ borderColor: "#BDB29A", color: TEAL }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: BASALT }}>
              Last name
            </span>
            <input
              name="lastName"
              type="text"
              required
              autoComplete="family-name"
              className="h-12 rounded-sm border bg-white px-3 text-base outline-none"
              style={{ borderColor: "#BDB29A", color: TEAL }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: BASALT }}>
              Mobile number
            </span>
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              className="h-12 rounded-sm border bg-white px-3 text-base outline-none"
              style={{ borderColor: "#BDB29A", color: TEAL }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: BASALT }}>
              Email
            </span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-12 rounded-sm border bg-white px-3 text-base outline-none"
              style={{ borderColor: "#BDB29A", color: TEAL }}
            />
          </label>
        </div>

        <div className="rounded-sm p-3" style={{ backgroundColor: OFF_WHITE }}>
          <div className="text-xs font-bold tracking-wide" style={{ color: MOSS }}>
            OPTIONAL, HELPS US PRIORITIZE
          </div>
          <div className="mt-2 text-sm font-semibold" style={{ color: BASALT }}>
            Deal under contract?
          </div>
          <div className="mt-1.5">
            <ChipRow options={["Yes", "No"] as const} value={dealUnderContract} onChange={setDealUnderContract} />
          </div>
          <div className="mt-3 text-sm font-semibold" style={{ color: BASALT }}>
            Need to close in
          </div>
          <div className="mt-1.5">
            <ChipRow options={CLOSING_TIMELINE_OPTIONS.map((o) => o.label)} value={timeline} onChange={setTimeline} />
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: MOSS }}>
          <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" />
          <span>
            I agree to receive emails and phone calls from Manna Lending about my deals and financing options. We
            will not text this number. See our{" "}
            <Link href="/privacy" target="_blank" className="underline" style={{ color: TEAL }}>
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" target="_blank" className="underline" style={{ color: TEAL }}>
              Terms &amp; Conditions
            </Link>
            .
          </span>
        </label>

        <ExcelGateSubmit />
      </ActionForm>
    </div>
  );
}

// --- Main component ----------------------------------------------------------

export function MaxOfferCalculator({ initialLeadId }: { initialLeadId: string | null }) {
  const [raw, setRaw] = useState<RawInputs>(DEFAULT_RAW);
  const [hasFlipExperience, setHasFlipExperience] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeTip, setActiveTip] = useState<FieldKey | null>(null);

  // "More assumptions" starts open on desktop, collapsed on mobile — decided
  // client-side from the actual viewport so this one component serves both
  // breakpoints without duplicating markup. Deferred to a microtask (not a
  // direct setState in the effect body) to avoid a synchronous cascading
  // render.
  useEffect(() => {
    Promise.resolve().then(() => {
      if (window.matchMedia("(min-width: 768px)").matches) setAdvancedOpen(true);
    });
  }, []);

  function setField(key: keyof RawInputs, value: string) {
    setRaw((r) => ({ ...r, [key]: value }));
  }
  function blurMoneyField(key: keyof RawInputs) {
    setRaw((r) => {
      const trimmed = r[key].trim();
      if (trimmed === "") return r;
      return { ...r, [key]: formatThousands(toNum(trimmed)) };
    });
  }

  const inputs = toCalcInputs(raw);
  const result = calculate(inputs);
  const st = status(result.margin);
  const statusStyle = STATUS_STYLE[st];
  const hasOffer = inputs.offer !== null && inputs.offer > 0;
  const scenarioLabel = hasOffer ? `your offer of ${money(inputs.offer!)}` : "the max allowable offer";
  const active = result.atOffer;
  const stress = stressTest(inputs, active.price);

  const [leadId, setLeadId] = useState<string | null>(initialLeadId);
  // `initialLeadId` resolves asynchronously in the parent (localStorage / a
  // verified `?lead=` URL param) and is still null on first render here —
  // pick it up once it arrives instead of only reading it at mount.
  useEffect(() => {
    if (!initialLeadId) return;
    Promise.resolve().then(() => setLeadId(initialLeadId));
  }, [initialLeadId]);
  const [downloading, setDownloading] = useState(false);
  const [showExcelGate, setShowExcelGate] = useState(false);

  async function runDownload(id: string) {
    setDownloading(true);
    try {
      await downloadMaxOfferExcel(inputs);
      logExcelDownloaded(id).catch((err) => console.error("Failed to log excel download:", err));
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadClick() {
    if (leadId) {
      await runDownload(leadId);
    } else {
      setShowExcelGate(true);
    }
  }

  async function handleGateSubmitted(id: string, dealUnderContract: boolean | null, timelineLabel: string | null, timelineDays: number | null) {
    setLeadId(id);
    setShowExcelGate(false);
    if (dealUnderContract !== null) {
      submitDealQuestions(id, dealUnderContract, timelineLabel ?? "Not sure yet", timelineDays).catch((err) =>
        console.error("Failed to submit deal questions:", err)
      );
    }
    // Immediate in-browser download, plus a follow-up email with the same
    // file attached (in case the browser download gets lost, or they want
    // it on a different device) and a link back to the calculator.
    await runDownload(id);
    sendMaxOfferExcelEmailAction(id, inputs, dealUnderContract, timelineLabel).catch((err) =>
      console.error("Failed to send max offer excel email:", err)
    );
  }

  function handleQualifyClick() {
    const tier: CtaTier = st === "below_target" ? "below_target" : st === "thin" ? "getting_close" : "on_target";
    if (leadId) logCtaClicked(leadId, tier).catch((err) => console.error("Failed to log CTA click:", err));
  }

  // Debounced usage logging, same pattern as the old wizard — only fires
  // once a lead exists (the calculator itself is free, so most visitors
  // never trigger this until they've downloaded the Excel at least once).
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!leadId || inputs.arv <= 0) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      logCalculatorUsed(leadId, { ...inputs }, { mao: result.mao, profit: result.profit, margin: result.margin }).catch((err) =>
        console.error("Failed to log calculator use:", err)
      );
    }, 800);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, raw]);

  // Mirrors scenario()'s own totalCost exactly (price + rehab + acquisition +
  // points + interest + holding) — deliberately excludes selling costs,
  // which aren't due until the eventual resale closing, not this one.
  const costRows = [
    { label: "Purchase price", amount: active.price },
    { label: "Rehab", amount: inputs.rehab },
    { label: "Buying closing costs", amount: active.acquisition },
    { label: "Lender points", amount: active.points },
    { label: "Loan interest", amount: active.interest },
    { label: "Holding costs", amount: active.holding },
  ];
  // Estimated cash due at THIS closing specifically (not the total cash
  // invested over the deal's life, above) — assumes the loan is drawn
  // against the purchase price first, with rehab released in draws later.
  // A simplifying assumption, not a lender commitment: see the caption next
  // to where this renders.
  const cashToClose = Math.max(0, active.price - active.loan) + active.acquisition + active.points;
  const breakdownRows = [
    { label: "Purchase price", amount: active.price, color: TEAL },
    { label: "Rehab", amount: inputs.rehab, color: "#3C6A78" },
    { label: "Buying closing costs", amount: active.acquisition, color: "#7C9EA9" },
    { label: "Lender points", amount: active.points, color: "#7C9EA9" },
    { label: "Loan interest", amount: active.interest, color: "#7C9EA9" },
    { label: "Holding costs", amount: active.holding, color: "#7C9EA9" },
    { label: "Selling costs", amount: active.selling, color: "#A9BFC6" },
    { label: "Your profit", amount: active.profit, color: GREEN, bold: true },
  ];

  const ovm = hasOffer ? offerVsMax(inputs, inputs.offer!) : null;
  const overBad = ovm && status(ovm.marginAtOffer) === "below_target";
  const overStyle = overBad ? { bg: `${RED}1A`, fg: RED } : { bg: `${AMBER}1A`, fg: "#6B4500" };

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.05fr_1fr] md:gap-6">
        {/* Inputs card */}
        <section aria-label="Deal inputs" className="flex flex-col gap-4 rounded-md border bg-white p-6 md:p-7" style={{ borderColor: "#E2DCCD" }}>
          <h2 className="text-xl font-medium" style={{ color: TEAL }}>
            Your deal
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {PRIMARY_META.map((meta) => (
              <LabeledInput
                key={meta.key}
                meta={meta}
                value={raw[meta.key as FieldKey]}
                onChange={(v) => setField(meta.key as FieldKey, v)}
                onBlur={() => meta.money && blurMoneyField(meta.key as FieldKey)}
                tipOpen={activeTip === meta.key}
                onToggleTip={() => setActiveTip((t) => (t === meta.key ? null : (meta.key as FieldKey)))}
              />
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide" style={{ color: MOSS }}>
              Completed a flip before?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(["Not yet", "Yes"] as const).map((label) => {
                const isYes = label === "Yes";
                const on = hasFlipExperience === isYes;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setHasFlipExperience(isYes);
                      setField("ltc", isYes ? "100" : "90");
                    }}
                    className="h-12 rounded-sm border text-sm font-semibold"
                    style={{ borderColor: TEAL, backgroundColor: on ? TEAL : "#FFFFFF", color: on ? OFF_WHITE : TEAL }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex h-11 items-center gap-2 self-start border-t pt-3 text-sm font-bold"
            style={{ borderColor: "#E2DCCD", color: TEAL }}
          >
            <span>{advancedOpen ? "Fewer assumptions" : "More assumptions"}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: advancedOpen ? "rotate(180deg)" : undefined }}
            >
              <path d="M2.5 5l4.5 4.5L11.5 5" />
            </svg>
          </button>

          {advancedOpen && (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <p className="sm:col-span-2 -mt-1.5 text-xs leading-relaxed" style={{ color: MOSS }}>
                Rate and points are placeholders for planning. Real terms vary by lender.
              </p>
              {ADVANCED_META.map((meta) => (
                <LabeledInput
                  key={meta.key}
                  meta={meta}
                  value={raw[meta.key as FieldKey]}
                  onChange={(v) => setField(meta.key as FieldKey, v)}
                  onBlur={() => meta.money && blurMoneyField(meta.key as FieldKey)}
                  tipOpen={activeTip === meta.key}
                  onToggleTip={() => setActiveTip((t) => (t === meta.key ? null : (meta.key as FieldKey)))}
                />
              ))}
            </div>
          )}
        </section>

        {/* Hero + offer widget */}
        <div className="flex flex-col gap-5 md:gap-6">
          <section aria-label="Max allowable offer" className="rounded-md p-6 md:p-7" style={{ backgroundColor: TEAL }}>
            <div className="text-xs font-bold tracking-wide" style={{ color: "#C9DCE2" }}>
              YOUR MAX ALLOWABLE OFFER
            </div>
            <div className="text-[52px] leading-[1.05] font-semibold tabular-nums md:text-[64px]" style={{ color: OFF_WHITE }}>
              {money(result.mao)}
            </div>
            <div className="mt-0.5 text-sm" style={{ color: "#C9DCE2" }}>
              {Math.round(inputs.pctOfArv * 100)}% of {money(inputs.arv)} ARV, minus {money(inputs.rehab)} rehab
            </div>
            <div className="my-4 border-t" style={{ borderColor: "#3C6A78" }} />
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold tracking-wide" style={{ color: "#C9DCE2" }}>
                  PROFIT IF YOU BUY AT THE MAX
                </div>
                <div className="text-3xl font-semibold tabular-nums md:text-4xl" style={{ color: OFF_WHITE }}>
                  {money(result.profit)}
                </div>
              </div>
              <div
                className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold"
                style={{ backgroundColor: statusStyle.bg, color: OFF_WHITE }}
              >
                {(result.margin * 100).toFixed(1)}% of ARV
              </div>
            </div>
            <MarginMeter margin={result.margin} />
            <div className="mt-1.5 text-sm font-semibold" style={{ color: OFF_WHITE }}>
              {statusStyle.label}. {statusStyle.text}
            </div>
          </section>

          <section aria-label="Your offer compared with the max" className="rounded-md border bg-white p-6 md:p-7" style={{ borderColor: "#E2DCCD" }}>
            <h2 className="text-xl font-medium" style={{ color: TEAL }}>
              How does your offer compare?
            </h2>
            <p className="mt-1 mb-3 text-xs" style={{ color: MOSS }}>
              Optional. Enter the price you are thinking of offering.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide" style={{ color: MOSS }}>
                Your planned offer
              </span>
              <div className="flex h-12 items-center gap-1 rounded-md border bg-white px-3" style={{ borderColor: "#CFC7B4" }}>
                <span className="text-base" style={{ color: MOSS }}>
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter an offer"
                  value={raw.offer}
                  onChange={(e) => setField("offer", e.target.value)}
                  onBlur={() => blurMoneyField("offer")}
                  className="w-full min-w-0 grow bg-transparent text-[17px] font-semibold tabular-nums outline-none"
                  style={{ color: TEAL }}
                />
              </div>
            </label>

            {!hasOffer && (
              <p className="mt-3 text-sm leading-relaxed" style={{ color: MOSS }}>
                We will show how it stacks up against your max of {money(result.mao)}, and what it does to your profit.
              </p>
            )}

            {hasOffer && ovm && ovm.state === "under" && (
              <div className="mt-3 rounded-sm p-3.5" style={{ backgroundColor: "#DDF0E4" }}>
                <div className="text-[17px] font-bold" style={{ color: "#1F5C3C" }}>
                  {ovm.difference < -0.5 ? `${money(-ovm.difference)} under your max. Great job.` : "Right at your max. Nicely disciplined."}
                </div>
                <div className="mt-1 text-sm leading-relaxed" style={{ color: TEAL }}>
                  At {money(inputs.offer!)}, projected profit is {money(ovm.profitAtOffer)} ({(ovm.marginAtOffer * 100).toFixed(1)}% of ARV).
                  {ovm.profitChange >= 1 ? ` ${money(ovm.profitChange)} more profit than buying at the max.` : ""}
                </div>
              </div>
            )}

            {hasOffer && ovm && ovm.state === "over" && (
              <div className="mt-3 overflow-hidden rounded-sm border" style={{ borderColor: overStyle.fg }}>
                <div className="p-3.5" style={{ backgroundColor: overStyle.bg, color: overStyle.fg }}>
                  <div className="text-[17px] font-bold">{money(ovm.difference)} over your max allowable offer</div>
                  <div className="mt-0.5 text-sm">
                    {overBad
                      ? "At this price the deal no longer pencils."
                      : status(ovm.marginAtOffer) === "thin"
                        ? "Your margin gets thin at this price."
                        : "It still pencils, but your cushion shrinks."}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: "#E2DCCD" }}>
                  <div className="bg-white p-3.5">
                    <div className="text-xs" style={{ color: MOSS }}>
                      At the max, {money(result.mao)}
                    </div>
                    <div className="text-2xl font-medium tabular-nums" style={{ color: TEAL }}>
                      {money(result.profit)}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "#1F5C3C" }}>
                      {(result.margin * 100).toFixed(1)}% of ARV
                    </div>
                  </div>
                  <div className="bg-white p-3.5">
                    <div className="text-xs" style={{ color: MOSS }}>
                      At your offer, {money(inputs.offer!)}
                    </div>
                    <div className="text-2xl font-medium tabular-nums" style={{ color: TEAL }}>
                      {money(ovm.profitAtOffer)}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: overStyle.fg }}>
                      {(ovm.marginAtOffer * 100).toFixed(1)}% of ARV
                    </div>
                  </div>
                </div>
                <div className="border-t bg-white p-3.5 text-sm leading-relaxed" style={{ borderColor: "#E2DCCD" }}>
                  <div className="font-bold" style={{ color: BASALT }}>
                    Your profit drops by {money(-ovm.profitChange)}.
                  </div>
                  <div className="mt-1" style={{ color: MOSS }}>
                    Every extra dollar you pay comes straight out of your profit, plus more closing costs and usually
                    more interest on a bigger loan. A thinner margin also leaves less room if the sale price comes in
                    lower.
                  </div>
                  <div className="mt-1.5 font-semibold" style={{ color: BASALT }}>
                    {ovm.breakEvenOffer > 0
                      ? `At about ${money(ovm.breakEvenOffer)} you would break even.`
                      : "You would not break even at any price on these numbers."}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDownloadClick}
        disabled={downloading}
        className="flex h-12 items-center justify-center gap-2 rounded-sm border-[1.5px] text-sm font-bold disabled:opacity-60 md:hidden"
        style={{ borderColor: TEAL, color: TEAL }}
      >
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {downloading ? "Preparing your file…" : "Save this deal as Excel"}
      </button>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
        <LenderPanel
          loan={active.loan}
          limitedBy={active.limitedBy}
          cashIn={active.cashIn}
          arv={inputs.arv}
          scenarioLabel={scenarioLabel}
          onCtaClick={handleQualifyClick}
        />

        <CashInvestedPanel
          costRows={costRows}
          totalCost={active.totalCost}
          loan={active.loan}
          cashToClose={cashToClose}
          cashIn={active.cashIn}
          cashOnCash={active.cashOnCash}
          scenarioLabel={scenarioLabel}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
        <BreakdownBars rows={breakdownRows} arv={inputs.arv} scenarioLabel={scenarioLabel} />
        <StressList points={stress} scenarioLabel={scenarioLabel} />
      </div>

      {showExcelGate ? (
        <ExcelGateForm onSubmitted={handleGateSubmitted} />
      ) : (
        <div className="rounded-md p-6 text-center md:p-8" style={{ backgroundColor: TEAL }}>
          <h2 className="text-2xl font-medium" style={{ color: OFF_WHITE }}>
            Take this deal with you
          </h2>
          <p className="mx-auto mt-1.5 mb-4 max-w-md text-sm leading-relaxed" style={{ color: "rgba(250,247,242,0.78)" }}>
            The same calculator in Excel, with live formulas, so you can keep testing deals. Your numbers come
            pre-filled.
          </p>
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={downloading}
            className="inline-flex h-13 items-center gap-2 rounded-sm px-8 text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: GOLD, color: BASALT }}
          >
            {downloading ? <Loader2 className="size-4 animate-spin" /> : null}
            {downloading ? "Preparing your file…" : "Get the Excel Version"}
          </button>
        </div>
      )}

      <p className="text-xs leading-relaxed" style={{ color: MOSS }}>
        Estimates for planning purposes only. Not a quote, pre-qualification or commitment to lend. Terms vary by
        program and are subject to underwriting approval. Manna Lending is a lending brokerage, not a lender. We
        connect real estate investors with third-party licensed lenders. Investor and business-purpose loans only.
        Questions about a deal? Text or call {LOAN_OFFICER_PHONE_COPY}.
      </p>
    </div>
  );
}
