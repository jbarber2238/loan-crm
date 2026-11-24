"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { buildChart, model, money, monthsText, num, signed, type BuydownChart, type BuydownInputs } from "@/lib/buydown-calc";
import { downloadBuydownExcel } from "@/lib/buydown-excel-export";
import { COMPANY_PHONE } from "@/lib/lead-constants";
import { recordBuydownExcelDownload, submitLead, verifyLeadId } from "@/server/actions/leads";

// Built from the approved design handoff (design/Main.dc.html). Colors, sizes and copy follow it; the header,
// footer and lead capture are the site's own.

const LEAD_SOURCE = "rate_buydown_calculator";
const STORAGE_KEY = `manna-lead-id:${LEAD_SOURCE}`;
const NO_LEAD = "00000000-0000-0000-0000-000000000000";

const TEAL = "#143d4a";
const CREAM = "#f6f1e9";
const SAND = "#cbb8a0";
const MOSS = "#68735f";
const MUTED = "#5f6b58";
const BASALT = "#1e1e1e";
const CARD_BORDER = "#eadfcc";
const INPUT_BORDER = "#a39378";
const AHEAD = "#5cc08a";
const AHEAD_TEXT = "#1f7a52";
const BEHIND = "#f0c36a";
const BEHIND_TEXT = "#8a5a0a";
const SERIF = "var(--font-source-serif), 'Source Serif 4', Georgia, serif";

const FOCUS = "focus-within:[outline:2px_solid_#143d4a] focus-within:[outline-offset:2px]";
const FOCUS_SELF = "focus-visible:[outline:2px_solid_#143d4a] focus-visible:[outline-offset:2px]";
const CARD = "rounded-[14px] border bg-white p-5 sm:p-8";
const LABEL: CSSProperties = { fontSize: 13, lineHeight: "16px", fontWeight: 600, color: MUTED };
const HINT: CSSProperties = { margin: 0, fontSize: 13, lineHeight: "18px", color: MOSS };

// The three options in "Try a different buy-down": line and label colors, and how each line is drawn.
const COMPARE = [
  { dot: TEAL, label: TEAL, line: { stroke: TEAL, strokeWidth: 4 } },
  { dot: "#d9822b", label: "#b4651a", line: { stroke: "#d9822b", strokeWidth: 3.5, strokeDasharray: "10 6" } },
  { dot: "#2f9e6a", label: AHEAD_TEXT, line: { stroke: "#2f9e6a", strokeWidth: 3.5, strokeDasharray: "1 7" } },
];

function SectionHead({ n, id, title, children }: { n: number; id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold" style={{ backgroundColor: TEAL, color: CREAM }}>
          {n}
        </span>
        <h2 id={id} className="m-0 text-[22px] leading-7 font-medium sm:text-[26px] sm:leading-8" style={{ fontFamily: SERIF, color: TEAL }}>
          {title}
        </h2>
      </div>
      {children && (
        <p className="m-0 max-w-[760px] text-sm leading-[22px]" style={{ color: MUTED }}>
          {children}
        </p>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  inputMode = "decimal",
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  inputMode?: "decimal" | "numeric" | "text" | "email" | "tel";
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} style={LABEL}>
        {label}
      </label>
      <div className={`flex min-h-12 items-center rounded-lg border bg-white ${FOCUS}`} style={{ borderColor: INPUT_BORDER }}>
        {prefix && (
          <span className="pl-3.5 text-base" style={{ color: MOSS }}>
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-[46px] min-w-0 flex-1 border-0 bg-transparent text-[17px] font-semibold outline-none"
          style={{ color: TEAL, padding: prefix ? "0 12px 0 6px" : "0 14px" }}
        />
        {suffix && (
          <span className="pr-3.5 text-sm whitespace-nowrap" style={{ color: MOSS }}>
            {suffix}
          </span>
        )}
      </div>
      {hint && <p style={HINT}>{hint}</p>}
    </div>
  );
}

/** Lines and shaded areas in SVG; every label is HTML laid over the drawing by percentage. */
function NetChart({
  chart,
  id,
  aria,
  lineStyles,
  labelColors,
  showAheadLabel,
}: {
  chart: BuydownChart;
  id: string;
  aria: string;
  lineStyles: CSSProperties[];
  labelColors: string[];
  showAheadLabel?: boolean;
}) {
  const tick: CSSProperties = { position: "absolute", whiteSpace: "nowrap", fontSize: 12, lineHeight: "14px", color: MOSS };
  const note: CSSProperties = { position: "absolute", whiteSpace: "nowrap", fontSize: 12, lineHeight: "14px", fontWeight: 600 };
  const areas = chart.negArea !== null;
  return (
    // Scrolls sideways on a phone instead of squeezing the labels into each other.
    <div className="overflow-x-auto">
      <div className="relative w-full min-w-[640px]">
        <svg viewBox={`0 0 ${chart.W} ${chart.H}`} role="img" aria-label={aria} className="block h-auto w-full">
          <defs>
            <linearGradient id={`gpos-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f9e6a" stopOpacity="0.6" />
              <stop offset="1" stopColor="#2f9e6a" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id={`gneg-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e8a93a" stopOpacity="0.1" />
              <stop offset="1" stopColor="#e8a93a" stopOpacity="0.65" />
            </linearGradient>
          </defs>
          {chart.yTicks.map((t, i) => (
            <line key={i} x1={chart.xL} x2={chart.xR} y1={t.y} y2={t.y} stroke="#e6dcc9" strokeWidth={1} strokeDasharray="2 6" />
          ))}
          {chart.negArea && <polygon points={chart.negArea} fill={`url(#gneg-${id})`} />}
          {chart.posArea && <polygon points={chart.posArea} fill={`url(#gpos-${id})`} />}
          <line x1={chart.xL} x2={chart.xR} y1={chart.y0} y2={chart.y0} stroke={TEAL} strokeWidth={1.5} />
          {chart.hold && <line x1={chart.hold.x} x2={chart.hold.x} y1={34} y2={296} stroke={TEAL} strokeWidth={1.5} strokeDasharray="4 4" />}
          {chart.lines.map((points, i) => (
            <polyline key={i} points={points} fill="none" strokeLinecap="round" strokeLinejoin="round" style={lineStyles[i]} />
          ))}
          {chart.dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={6.5} fill={d.ahead ? "#2f9e6a" : BEHIND} stroke="#ffffff" strokeWidth={2.5} />
          ))}
          {chart.crossPill && chart.crossX !== null && <circle cx={chart.crossX} cy={chart.y0} r={6} fill="#ffffff" stroke="#2f9e6a" strokeWidth={3} />}
          {chart.hold && (
            <>
              <circle cx={chart.hold.x} cy={chart.hold.dotY} r={10} fill="#ffffff" stroke={TEAL} strokeWidth={4} />
              <circle cx={chart.hold.x} cy={chart.hold.dotY} r={3.5} fill={TEAL} />
            </>
          )}
        </svg>
        {chart.yTicks.map((t, i) => (
          <div key={`y${i}`} style={{ ...tick, ...t.pos }}>
            {t.label}
          </div>
        ))}
        {chart.xTicks.map((t, i) => (
          <div key={`x${i}`} style={{ ...tick, ...t.pos }}>
            {t.label}
          </div>
        ))}
        <div style={{ ...note, color: TEAL, ...chart.zeroPos }}>$0 = break-even line</div>
        {areas && <div style={{ ...note, color: BEHIND_TEXT, ...chart.negPos }}>Behind: cost not yet earned back</div>}
        {areas && showAheadLabel && <div style={{ ...note, color: AHEAD_TEXT, ...chart.posPos }}>Ahead</div>}
        {chart.crossPill && (
          <div style={{ ...note, color: AHEAD_TEXT, background: "#ffffff", border: "1.5px solid #2f9e6a", borderRadius: 999, padding: "5px 12px", ...chart.crossPill.pos }}>
            {chart.crossPill.text}
          </div>
        )}
        {chart.hold && (
          <div style={{ ...note, color: CREAM, background: TEAL, borderRadius: 999, padding: "6px 14px", ...chart.hold.pill.pos }}>{chart.hold.pill.text}</div>
        )}
        {chart.labels.map((lb) => (
          <div key={lb.series} style={{ position: "absolute", whiteSpace: "nowrap", fontSize: 13, lineHeight: "16px", fontWeight: 500, color: labelColors[lb.series], ...lb.pos }}>
            {lb.text}
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_HOLDS = ["6", "12", "24", "36", "60", "84", "120"];

export function BuydownCalculator() {
  // What's typed, kept as typed so half-finished numbers ("7.") aren't fought with.
  const [loan, setLoan] = useState("400000");
  const [r0, setR0] = useState("7.99");
  const [r1, setR1] = useState("7.75");
  const [term, setTerm] = useState("30");
  const [io, setIo] = useState(false);
  const [fee, setFee] = useState("4000");
  const [same, setSame] = useState("5000");
  const [holdText, setHoldText] = useState("65");
  const [holds, setHolds] = useState(DEFAULT_HOLDS);
  // The two "what if" quotes start as examples, per the design.
  const [aFee, setAFee] = useState("8000");
  const [aRate, setARate] = useState("7.5");
  const [bFee, setBFee] = useState("2000");
  const [bRate, setBRate] = useState("7.87");

  // Excel download gate.
  const [leadId, setLeadId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot: people never see or fill this
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedFor, setDownloadedFor] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);

  // Someone who filled in the form on an earlier visit isn't asked again.
  useEffect(() => {
    Promise.resolve().then(async () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // Private browsing or blocked storage: the form just asks again.
      }
      if (!stored) return;
      const valid = await verifyLeadId(stored).catch(() => false);
      if (valid) setLeadId(stored);
      else {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Nothing to do.
        }
      }
    });
  }, []);

  const v = useMemo(() => {
    const L = num(loan);
    const ptsOf = (f: string) => (L > 0 ? Math.max(0, num(f)) / L : 0);
    const o: BuydownInputs = { L, r0: num(r0) / 100, r1: num(r1) / 100, T: Math.max(1, num(term)), io, pts: ptsOf(fee), extra: 0, same: num(same) };
    const hold = Math.max(0, Math.round(num(holdText)));
    const m = model(o);
    const at = m.at(hold);
    const be = m.be;
    const ahead = at.net >= 0;
    const ptsLabel = (f: string) => {
      const p = (Math.round(ptsOf(f) * 10000) / 100).toFixed(2);
      return p + (p === "1.00" ? " point" : " points");
    };

    // "% of cost recovered" ring.
    const pct = m.up > 0 ? Math.max(0, ((at.saved + at.pay) / m.up) * 100) : 100;
    const CIRC = 2 * Math.PI * 56;

    // Timeline bar: how far along break-even and the exit are.
    const tlEnd = Math.max(12, Math.ceil((Math.max(hold, be || 0) * 1.2) / 6) * 6);
    const bePct = be === null ? 100 : Math.min(100, (be / tlEnd) * 100);
    const holdPct = Math.min(100, (hold / tlEnd) * 100);

    // Bars in "what you pay vs. what you get back" share one scale.
    const sc = Math.max(m.up, at.saved + at.pay, 1);

    // Net benefit over time, with the seven hold times as dots.
    const xmax = hold > 120 ? Math.ceil(hold / 12) * 12 : 120;
    const holdsN = holds.map((h) => Math.max(0, Math.round(num(h))));
    const cA = buildChart([{ m, name: "" }], xmax, hold, holdsN, true, `Month ${hold}: ${signed(at.net)}`);
    const years = xmax / 12;
    const crossText = cA.cross === null ? `Does not turn positive within ${years} years.` : cA.cross === 0 ? "Ahead from day one." : `Net benefit turns positive at about month ${Math.round(cA.cross)}.`;
    const rows = holdsN.map((k) => {
      const a = m.at(k);
      return { k, years: (Math.round((k / 12) * 100) / 100).toString(), saved: money(a.saved), pay: money(a.pay), net: signed(a.net), pos: a.net >= 0 };
    });

    // Your quote next to two other quotes.
    const opt = (f: string, rate: string) => model({ ...o, pts: ptsOf(f), r1: num(rate) / 100 });
    const mA = opt(aFee, aRate);
    const mB = opt(bFee, bRate);
    const list = [
      { key: "main" as const, title: "Your quote", m },
      { key: "a" as const, title: "What if A", m: mA },
      { key: "b" as const, title: "What if B", m: mB },
    ].map((c) => ({ ...c, net: c.m.at(hold).net }));
    const maxAbs = Math.max(1, ...list.map((c) => Math.abs(c.net)));
    const bestNet = Math.max(...list.map((c) => c.net));
    const bestIndex = list.findIndex((c) => c.net === bestNet);
    const opts = list.map((c, i) => ({
      ...c,
      upfront: money(c.m.up),
      save: money(c.m.save, 2),
      be: c.m.be === null ? "Never" : `Month ${monthsText(c.m.be)}`,
      netText: signed(c.net),
      pos: c.net >= 0,
      barWidth: Math.max(2, (Math.abs(c.net) / maxAbs) * 100).toFixed(1) + "%",
      best: i === bestIndex && bestNet > 0,
    }));
    const cB = buildChart(
      [
        { m, name: "Your quote" },
        { m: mA, name: "What if A" },
        { m: mB, name: "What if B" },
      ],
      xmax,
      hold,
      [],
      false,
      `Your exit: month ${hold}`
    );

    return {
      o,
      hold,
      m,
      at,
      be,
      ahead,
      ptsLabel,
      ptsPct: (Math.round(ptsOf(fee) * 10000) / 100).toFixed(2) + "% of your loan",
      r1Text: Math.round(num(r1) * 1000) / 1000 + "%",
      verdictHead: be === null ? "The buy-down never pays back." : ahead ? "Yes, the buy-down pays for itself before you exit." : "Skip it. You would exit before the buy-down pays back.",
      verdictSub:
        be === null
          ? "The lower rate does not lower your monthly payment, so the upfront cost is never earned back."
          : ahead
            ? `At month ${hold} you come out ${money(at.net)} ahead.`
            : `At month ${hold} you would be ${money(Math.abs(at.net))} behind.`,
      edgeNote: be !== null && ahead && hold < be ? `Payment savings alone take until month ${monthsText(be)}. Your extra principal paydown tips the total above zero before then.` : "",
      pctText: m.up > 0 ? Math.round(pct) + "%" : "100%",
      ringDash: ((Math.min(pct, 100) / 100) * CIRC).toFixed(1) + " " + CIRC.toFixed(1),
      accent: ahead ? "#7fe0a8" : "#f2c76e",
      tlEnd,
      bePct,
      holdPct,
      costBar: ((m.up / sc) * 100).toFixed(2) + "%",
      savedBar: ((Math.max(0, at.saved) / sc) * 100).toFixed(2) + "%",
      payBar: ((Math.max(0, at.pay) / sc) * 100).toFixed(2) + "%",
      xmax,
      years,
      holdsN,
      cA,
      crossText,
      rows,
      opts,
      cB,
    };
  }, [loan, r0, r1, term, io, fee, same, holdText, holds, aFee, aRate, bFee, bRate]);

  const { m, at, be, hold, ahead } = v;
  const holdRange = Math.min(Math.max(hold, 1), 120);

  // The deal as it stands, so "your file is on its way" clears as soon as a number changes.
  const dealKey = JSON.stringify([v.o, hold, v.holdsN]);
  const formReady = name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10 && consent;
  const canDownload = Boolean(leadId) || formReady;

  async function handleDownload() {
    if (!canDownload || busy) return;
    setBusy(true);
    setError(null);
    try {
      let id = leadId;
      let justSubmitted = false;
      if (!id) {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("email", email);
        fd.set("phone", phone);
        fd.set("consent", "on");
        fd.set("website", website);
        id = (await submitLead(LEAD_SOURCE, fd)).leadId;
        justSubmitted = true;
        if (id !== NO_LEAD) {
          setLeadId(id);
          try {
            localStorage.setItem(STORAGE_KEY, id);
          } catch {
            // Fine: they're asked again next visit.
          }
        }
      }
      await downloadBuydownExcel(v.o, hold, v.holdsN.slice(0, 7));
      setDownloadedFor(dealKey);
      setEmailed(justSubmitted && id !== NO_LEAD);
      recordBuydownExcelDownload(
        id,
        { loanAmount: v.o.L, rateNoBuydown: num(r0), rateWithBuydown: num(r1), termYears: v.o.T, interestOnly: io, buydownFee: Math.max(0, num(fee)), sameClosingCosts: v.o.same, holdMonths: hold, holdTimes: v.holdsN.slice(0, 7) },
        justSubmitted
      ).catch((err) => console.error("Failed to record the download:", err));
    } catch (err) {
      console.error(err);
      setError(`We couldn't get your file ready. Please try again in a few minutes, or call us at ${COMPANY_PHONE}.`);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (on: boolean): CSSProperties =>
    on ? { background: TEAL, color: CREAM, border: `1px solid ${TEAL}` } : { background: "#ffffff", color: BASALT, border: `1px solid ${MOSS}` };
  const tile = "flex flex-col gap-1 rounded-xl px-6 py-5";
  const tileLabel: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: SAND };
  const bigNum = "m-0 text-[36px] leading-[42px] font-medium sm:text-[44px] sm:leading-[48px]";
  const pillAt = (pct: number): CSSProperties => ({ left: `${pct.toFixed(2)}%`, transform: `translateX(-${pct.toFixed(2)}%)` });
  const tableCols = "grid grid-cols-[1.1fr_0.8fr_1fr_1fr_1fr_1.1fr_1fr] gap-4";

  return (
    <div className="flex flex-col gap-6" style={{ color: BASALT }}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* 1 · Your deal */}
        <section aria-labelledby="deal-h" className={`${CARD} flex flex-col gap-7`} style={{ borderColor: CARD_BORDER }}>
          <SectionHead n={1} id="deal-h" title="Your deal">
            Fill in each box. Your answer updates as you type.
          </SectionHead>
          <div className="flex flex-col gap-[18px]">
            <Field id="f-loan" label="Loan amount" prefix="$" value={loan} onChange={setLoan} />
            <div className="grid grid-cols-2 gap-3.5">
              <Field id="f-r0" label="Rate with no buy-down" suffix="%" value={r0} onChange={setR0} />
              <Field id="f-r1" label="Rate with buy-down" suffix="%" value={r1} onChange={setR1} />
            </div>
            <p style={{ ...HINT, marginTop: -8 }}>Use the two rates your lender quoted you.</p>
            <div className="grid grid-cols-2 gap-3.5">
              <Field id="f-fee" label="Rate buy-down fee" prefix="$" value={fee} onChange={setFee} />
              <Field id="f-term" label="Loan term" suffix="years" inputMode="numeric" value={term} onChange={setTerm} />
            </div>
            <p style={{ ...HINT, marginTop: -8 }}>Enter the rate buy-down fee from your term sheet.</p>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[10px] border px-4 py-3" style={{ background: "#f4faf6", borderColor: "#d3e9dc" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>Points (calculated for you)</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: AHEAD_TEXT }}>
                {v.ptsLabel(fee)} <span style={{ fontSize: 13, fontWeight: 400, color: MUTED }}>· {v.ptsPct}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="pt-label" style={LABEL}>
                Payment type
              </span>
              <div role="group" aria-labelledby="pt-label" className="flex gap-2">
                <button type="button" aria-pressed={!io} onClick={() => setIo(false)} className={`min-h-12 flex-1 cursor-pointer rounded-lg px-4 text-[15px] font-semibold ${FOCUS_SELF}`} style={toggle(!io)}>
                  Amortizing
                </button>
                <button type="button" aria-pressed={io} onClick={() => setIo(true)} className={`min-h-12 flex-1 cursor-pointer rounded-lg px-4 text-[15px] font-semibold ${FOCUS_SELF}`} style={toggle(io)}>
                  Interest-only
                </button>
              </div>
              <p style={HINT}>Pick interest-only if your DSCR loan has an interest-only period.</p>
            </div>
            <Field id="f-same" label="Closing costs that are the same either way" prefix="$" value={same} onChange={setSame} hint="Shows in cash to close. Does not change break-even." />
          </div>
          <div className="flex flex-col gap-3.5 border-t pt-6" style={{ borderColor: "#efe6d6" }}>
            <Field id="f-hold" label="Months you plan to hold the loan" suffix="months" inputMode="numeric" value={holdText} onChange={setHoldText} hint="Months until you refinance or sell." />
            <input type="range" min={1} max={120} step={1} value={holdRange} onChange={(e) => setHoldText(e.target.value)} aria-label="Months you plan to hold the loan" className="w-full" style={{ accentColor: TEAL }} />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Your answer */}
          <section aria-labelledby="ans-h" className="flex flex-col gap-7 rounded-[18px] p-6 sm:p-9" style={{ background: "linear-gradient(135deg,#143d4a 0%,#1b5663 100%)" }}>
            <div className="flex flex-wrap items-center justify-between gap-8">
              <div className="flex flex-[1_1_300px] flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full" style={{ background: v.accent }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#0f2f39" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                      <path d={ahead ? "M5 12.5l4.5 4.5L19 7.5" : "M12 7v5.5l3.5 2"} />
                    </svg>
                  </span>
                  <p style={tileLabel}>Your answer</p>
                </div>
                <h2 id="ans-h" aria-live="polite" className="m-0 text-[26px] leading-[34px] font-medium text-balance sm:text-[32px] sm:leading-10" style={{ fontFamily: SERIF, color: CREAM }}>
                  {v.verdictHead}
                </h2>
                <p className="m-0 text-base leading-6" style={{ color: "#e8e0d2" }}>
                  {v.verdictSub}
                </p>
                {v.edgeNote && (
                  <p className="m-0 text-[13px] leading-5" style={{ color: SAND }}>
                    {v.edgeNote}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center gap-2.5">
                <div className="relative size-[156px]">
                  <svg width="156" height="156" viewBox="0 0 156 156" role="img" aria-label="Share of the upfront cost recovered by your exit month" className="block">
                    <circle cx="78" cy="78" r="56" fill="none" stroke="#2b5967" strokeWidth={14} />
                    <circle cx="78" cy="78" r="56" transform="rotate(-90 78 78)" fill="none" strokeWidth={14} strokeLinecap="round" stroke={v.accent} strokeDasharray={v.ringDash} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span style={{ fontFamily: SERIF, fontSize: 36, lineHeight: "40px", fontWeight: 500, color: CREAM }}>{v.pctText}</span>
                    <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: SAND }}>recovered</span>
                  </div>
                </div>
                <p className="m-0 max-w-[170px] text-center text-xs leading-4" style={{ color: SAND }}>
                  of the {money(m.up)} you pay today, by month {hold}. 100% is break-even.
                </p>
              </div>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))" }}>
              <div className={tile} style={{ background: "rgba(255,255,255,0.08)" }}>
                <p style={tileLabel}>Break-even</p>
                <p className={bigNum} style={{ fontFamily: SERIF, color: CREAM }}>
                  {be === null ? "Never" : `Month ${monthsText(be)}`}
                </p>
                <p className="m-0 text-sm" style={{ color: "#e8e0d2" }}>
                  {be === null ? "No monthly savings" : `${Math.round((be / 12) * 10) / 10} years`}
                </p>
              </div>
              <div className={tile} style={{ background: "rgba(255,255,255,0.08)" }}>
                <p style={tileLabel}>Net benefit at month {hold}</p>
                <p className={bigNum} style={{ fontFamily: SERIF, color: v.accent }}>
                  {signed(at.net)}
                </p>
                <p className="m-0">
                  <span className="inline-block rounded-full px-3 py-[3px] text-[13px] font-semibold" style={ahead ? { background: "#7fe0a8", color: "#0c3a28" } : { background: "#f2c76e", color: "#3a2a05" }}>
                    {ahead ? "Ahead" : "Behind"}
                  </span>
                </p>
              </div>
              <div className={tile} style={{ background: "rgba(255,255,255,0.08)" }}>
                <p style={tileLabel}>Payment drops by</p>
                <p className={bigNum} style={{ fontFamily: SERIF, color: CREAM }}>
                  {money(m.save, 2)}
                </p>
                <p className="m-0 text-sm" style={{ color: "#e8e0d2" }}>
                  a month
                </p>
              </div>
            </div>
          </section>

          {/* 2 · When does it pay back? */}
          <section aria-labelledby="tl-h" className={`${CARD} flex flex-col gap-5`} style={{ borderColor: CARD_BORDER }}>
            <SectionHead n={2} id="tl-h" title="When does it pay back?">
              Months from closing. Amber is cost you are still earning back. Green is money in your pocket.
            </SectionHead>
            <div className="relative mx-1.5 h-[150px]">
              <div className="absolute inset-x-0 top-14 h-10 rounded-xl" style={{ background: CREAM }} />
              <div className="absolute top-14 left-0 flex h-10 items-center overflow-hidden px-3.5" style={{ background: BEHIND, width: `${v.bePct.toFixed(2)}%`, borderRadius: v.bePct >= 100 ? 12 : "12px 0 0 12px" }}>
                {v.bePct > 22 && <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "#3a2a05" }}>Earning the cost back</span>}
              </div>
              {be !== null && v.bePct < 100 && (
                <div className="absolute top-14 flex h-10 items-center justify-end overflow-hidden px-3.5" style={{ background: AHEAD, left: `${v.bePct.toFixed(2)}%`, width: `${(100 - v.bePct).toFixed(2)}%`, borderRadius: "0 12px 12px 0" }}>
                  {100 - v.bePct > 18 && <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "#0c3a28" }}>You are ahead</span>}
                </div>
              )}
              {be !== null && (
                <>
                  <div className="absolute top-[38px] h-[76px] w-0.5" style={{ background: TEAL, marginLeft: -1, left: `${v.bePct.toFixed(2)}%` }} />
                  <div className="absolute top-1.5 rounded-full px-3 py-[5px] text-[13px] font-semibold whitespace-nowrap" style={{ color: CREAM, background: TEAL, ...pillAt(v.bePct) }}>
                    Break-even: month {monthsText(be)}
                  </div>
                </>
              )}
              <div className="absolute top-12 h-14 w-0" style={{ borderLeft: `2px dashed ${BASALT}`, marginLeft: -1, left: `${v.holdPct.toFixed(2)}%` }} />
              <div className="absolute top-[114px] rounded-full bg-white px-3 py-[3px] text-[13px] font-semibold whitespace-nowrap" style={{ color: TEAL, border: `2px solid ${TEAL}`, ...pillAt(v.holdPct) }}>
                You exit: month {hold}
              </div>
              {v.holdPct > 12 && <div className="absolute top-[102px] left-0 text-xs" style={{ color: MOSS }}>0</div>}
              {v.holdPct < 70 && <div className="absolute top-[102px] right-0 text-xs" style={{ color: MOSS }}>{v.tlEnd} months</div>}
            </div>
          </section>
        </div>
      </div>

      {/* 3 · What you pay vs. what you get back */}
      <section aria-labelledby="money-h" className="flex flex-wrap gap-8 rounded-[14px] border p-5 sm:gap-10 sm:p-8" style={{ background: "#f4faf6", borderColor: "#d3e9dc" }}>
        <div className="flex flex-[2_1_420px] flex-col gap-6">
          <SectionHead n={3} id="money-h" title="What you pay vs. what you get back">
            By month {hold}, here is what the points cost and what the lower rate returns.
          </SectionHead>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-4 text-[15px] font-semibold">
              <span>You pay today</span>
              <span>{money(m.up)}</span>
            </div>
            <div className="h-[34px] overflow-hidden rounded-full" style={{ background: "#e6efe9" }}>
              <div className="h-full rounded-full" style={{ background: BEHIND, width: v.costBar }} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-4 text-[15px] font-semibold">
              <span>You get back</span>
              <span>{money(at.saved + at.pay)}</span>
            </div>
            <div className="flex h-[34px] overflow-hidden rounded-full" style={{ background: "#e6efe9" }}>
              <div className="h-full" style={{ background: TEAL, width: v.savedBar }} />
              <div className="h-full" style={{ background: AHEAD, width: v.payBar }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            {[
              [BEHIND, "Points and fees"],
              [TEAL, `Lower payments: ${money(at.saved)}`],
              [AHEAD, `Extra principal paid: ${money(at.pay)}`],
            ].map(([color, text]) => (
              <div key={text} className="flex items-center gap-2">
                <span className="block size-3.5 rounded" style={{ background: color }} />
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-5 text-[15px]" style={{ borderColor: "#d3e9dc" }}>
            Your payment drops by <strong className="font-semibold">{money(m.save, 2)}</strong> a month, from {money(m.p0, 2)} to {money(m.p1, 2)}.
          </div>
        </div>
        <div className="flex flex-[1_1_260px] flex-col gap-5 self-start rounded-[14px] border bg-white p-6" style={{ borderColor: "#d3e9dc" }}>
          <div className="flex flex-col gap-2.5">
            <p className="m-0" style={LABEL}>Cash to close</p>
            <div className="flex justify-between gap-4">
              <span className="text-sm">Without buy-down</span>
              <span className="text-base font-semibold" style={{ color: TEAL }}>{money(v.o.same)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-sm">With buy-down</span>
              <span className="text-base font-semibold" style={{ color: TEAL }}>{money(v.o.same + m.up)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 border-t pt-5" style={{ borderColor: CARD_BORDER }}>
            <p className="m-0" style={LABEL}>Loan balance at month {hold}</p>
            <div className="flex justify-between gap-4">
              <span className="text-sm">Without buy-down</span>
              <span className="text-base font-semibold" style={{ color: TEAL }}>{money(at.b0)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-sm">With buy-down</span>
              <span className="text-base font-semibold" style={{ color: TEAL }}>{money(at.b1)}</span>
            </div>
            <p style={HINT}>
              {io ? "Interest-only payments don't pay down the balance, so it's the same either way." : `You owe ${money(at.b0 - at.b1)} less, because more of each payment goes to principal.`}
            </p>
          </div>
        </div>
      </section>

      {/* 4 · How long you hold changes the answer */}
      <section aria-labelledby="hold-h" className={`${CARD} flex flex-col gap-6`} style={{ borderColor: CARD_BORDER }}>
        <SectionHead n={4} id="hold-h" title="How long you hold changes the answer">
          Above the line you are ahead. Below it, the buy-down has not paid for itself yet. This line also counts the extra principal you pay down, so it turns positive a little before the break-even month.
        </SectionHead>
        <NetChart
          chart={v.cA}
          id="cA"
          aria={`Net benefit of buying down over time. ${v.cA.cross === null ? `It does not turn positive within ${v.years} years.` : `It turns positive at about month ${Math.round(v.cA.cross)}.`}`}
          lineStyles={[{ stroke: TEAL, strokeWidth: 4 }]}
          labelColors={[TEAL]}
          showAheadLabel={v.cA.cross !== null && v.cA.cross < v.xmax - 6}
        />
        <p className="m-0 -mt-2 text-center" style={HINT}>
          Months from closing
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="block size-3 rounded-full" style={{ background: "#2f9e6a" }} />
            <span>Green dot: ahead at that hold time</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="block size-3 rounded-full" style={{ background: BEHIND }} />
            <span>Amber dot: behind</span>
          </div>
          <span className="font-semibold" style={{ color: AHEAD_TEXT }}>
            {v.crossText}
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: CARD_BORDER }}>
          <div className="min-w-[760px]" role="table" aria-label="Net benefit by hold time">
            <div role="row" className={`${tableCols} rounded-t-xl border-b px-6 py-3.5 text-[13px] leading-4 font-semibold`} style={{ borderColor: CARD_BORDER, background: "#faf7f2", color: MUTED }}>
              {["Hold (months)", "Hold (years)", "Payments saved", "Extra paydown", "Upfront cost", "Net benefit", "Status"].map((h) => (
                <span key={h} role="columnheader">
                  {h}
                </span>
              ))}
            </div>
            {v.rows.map((r, i) => (
              <div key={i} role="row" className={`${tableCols} items-center border-b px-6 py-2 text-[15px] last:border-b-0`} style={{ borderColor: "#f3ecdf" }}>
                <div role="cell" className={`flex h-10 max-w-[110px] rounded-lg border bg-white ${FOCUS}`} style={{ borderColor: INPUT_BORDER }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Hold time ${i + 1}, in months`}
                    value={holds[i]}
                    onChange={(e) => setHolds((h) => h.map((x, j) => (j === i ? e.target.value : x)))}
                    className="w-full min-w-0 border-0 bg-transparent px-2.5 text-[15px] font-semibold outline-none"
                    style={{ color: TEAL }}
                  />
                </div>
                <span role="cell">{r.years}</span>
                <span role="cell">{r.saved}</span>
                <span role="cell">{r.pay}</span>
                <span role="cell">{money(m.up)}</span>
                <span role="cell" className="font-semibold" style={{ color: r.pos ? AHEAD_TEXT : BEHIND_TEXT }}>
                  {r.net}
                </span>
                <span role="cell" className="flex items-center gap-2">
                  <span className="block size-3.5 rounded" style={{ background: r.pos ? AHEAD : BEHIND }} />
                  {r.pos ? "Ahead" : "Not yet"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p style={HINT}>Change any hold time in the table to test your own dates.</p>
      </section>

      {/* 5 · Try a different buy-down */}
      <section aria-labelledby="cmp-h" className={`${CARD} flex flex-col gap-6`} style={{ borderColor: CARD_BORDER }}>
        <SectionHead n={5} id="cmp-h" title="Try a different buy-down">
          Your quote is on the left. Type in two other quotes to see which one comes out ahead at month {hold}. The numbers in What if A and B are examples. Replace them with your lender&apos;s.
        </SectionHead>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))" }}>
          {v.opts.map((c, i) => {
            const edit = c.key === "a" ? { fee: aFee, setFee: setAFee, rate: aRate, setRate: setARate } : c.key === "b" ? { fee: bFee, setFee: setBFee, rate: bRate, setRate: setBRate } : null;
            return (
              <div key={c.key} className="flex flex-col gap-[18px] rounded-xl p-6" style={c.best ? { border: "2px solid #2f9e6a", background: "#f1faf4" } : { border: `1px solid ${CARD_BORDER}`, background: "#faf7f2" }}>
                <div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="block size-3.5 rounded-full" style={{ background: COMPARE[i].dot }} />
                    <p className="m-0 text-xl leading-[26px] font-medium" style={{ fontFamily: SERIF, color: TEAL }}>
                      {c.title}
                    </p>
                  </div>
                  {c.best && <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: "#2f9e6a" }}>Best at your hold time</span>}
                </div>
                {edit ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id={`${c.key}-fee`} label="Buy-down fee ($)" value={edit.fee} onChange={edit.setFee} />
                      <Field id={`${c.key}-rate`} label="Rate (%)" value={edit.rate} onChange={edit.setRate} />
                    </div>
                    <p className="m-0 -mt-2 text-[13px] font-semibold" style={{ color: AHEAD_TEXT }}>
                      That is {v.ptsLabel(edit.fee)}
                    </p>
                  </>
                ) : (
                  <p className="m-0 min-h-12 text-[15px] leading-6">
                    {money(Math.max(0, num(fee)))} fee ({v.ptsLabel(fee)}) for a rate of {v.r1Text}
                  </p>
                )}
                <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: CARD_BORDER }}>
                  {[
                    ["Upfront cost", c.upfront],
                    ["Monthly savings", c.save],
                    ["Break-even", c.be],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="text-sm">{label}</span>
                      <span className="text-[15px] font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: "36px", fontWeight: 500, color: TEAL }}>{c.netText}</span>
                    <span className="text-[13px] font-semibold">{c.pos ? `ahead at month ${hold}` : `behind at month ${hold}`}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full" style={{ background: "#f1ebe0" }}>
                    <div className="h-full rounded-full" style={{ width: c.barWidth, background: c.pos ? AHEAD : BEHIND }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-3">
          <p className="m-0" style={LABEL}>Net benefit at month {hold}, side by side</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))" }}>
            {v.opts.map((c, i) => (
              <div key={c.key} className="flex items-center gap-3 rounded-[10px] px-4 py-3" style={{ background: "#faf7f2" }}>
                <span className="block h-1.5 w-7 shrink-0 rounded-[3px]" style={{ background: COMPARE[i].dot }} />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold" style={{ color: TEAL }}>
                    {c.title}: {c.netText}
                  </span>
                  <span className="text-xs" style={{ color: MUTED }}>
                    Break-even {c.be}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <NetChart chart={v.cB} id="cB" aria="Net benefit over time for three buy-down options." lineStyles={COMPARE.map((c) => c.line)} labelColors={COMPARE.map((c) => c.label)} />
        <p className="m-0 text-center" style={HINT}>
          Months from closing
        </p>
        <p style={HINT}>Solid teal is your quote. Orange dashes are What if A. Green dots are What if B. Where a line crosses $0, that option has paid for itself.</p>
      </section>

      {/* 6 · Take this deal with you */}
      <section aria-labelledby="dl-h" className={`${CARD} flex flex-wrap items-start gap-8 sm:gap-10`} style={{ borderColor: CARD_BORDER }}>
        <div className="flex flex-[1_1_300px] flex-col gap-2.5">
          <SectionHead n={6} id="dl-h" title="Take this deal with you">
            Get the Excel version with your numbers already filled in. Change any sand cell and the rest recalculates. We&apos;ll email you a copy too.
          </SectionHead>
        </div>
        <div className="flex flex-[1_1_360px] flex-col gap-4">
          {leadId ? (
            <p className="m-0 text-sm leading-[22px]" style={{ color: MUTED }}>
              Welcome back. Your download is unlocked.
            </p>
          ) : (
            <>
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="f-website">Website</label>
                <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <Field id="f-name" label="Name" inputMode="text" autoComplete="name" value={name} onChange={setName} />
              <Field id="f-email" label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} />
              <Field id="f-phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={setPhone} />
              <label className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: MOSS }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0" style={{ accentColor: TEAL }} />
                <span>
                  I agree to receive emails and phone calls from Manna Lending about my deals and financing options. We will not text this number. See our{" "}
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
            </>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canDownload || busy}
            className={`inline-flex min-h-[50px] items-center justify-center gap-2 rounded-lg px-7 text-[15px] font-semibold ${FOCUS_SELF} ${canDownload ? "cursor-pointer hover:bg-[#1e1e1e]" : "cursor-not-allowed"}`}
            style={canDownload ? { background: TEAL, color: CREAM, border: 0 } : { background: "#f1ebe0", color: MUTED, border: "1px solid #d9ccb5" }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Preparing your file…" : "Download Excel"}
          </button>
          {!canDownload && <p style={HINT}>Enter your name, email and phone, and check the box, to unlock the download.</p>}
          {error && (
            <p role="alert" className="m-0 text-sm leading-[22px] font-semibold" style={{ color: "#8a2a22" }}>
              {error}
            </p>
          )}
          {downloadedFor === dealKey && !error && (
            <p role="status" className="m-0 text-sm leading-[22px] font-semibold" style={{ color: TEAL }}>
              Your Excel file is on its way, with the formulas intact.{emailed ? " We emailed you a copy too." : ""}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
