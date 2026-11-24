// Rate buy-down break-even math, ported from the approved design handoff (logic/calculator-logic.js), which was
// checked against the original Excel workbook for amortizing, interest-only and zero-savings cases. Pure, so the
// page, the Excel download and the tests all share it. Rates are decimals (0.0799); `pts` is fee / loan.

export interface BuydownInputs {
  /** Loan amount. */
  L: number;
  /** Rate with no buy-down. */
  r0: number;
  /** Rate with the buy-down. */
  r1: number;
  /** Loan term in years. */
  T: number;
  /** Interest-only payments. */
  io: boolean;
  /** Points as a fraction of the loan (buy-down fee / loan amount). */
  pts: number;
  /** Extra closing costs for the buy-down loan. The page never asks for this; it stays 0. */
  extra: number;
  /** Closing costs that are the same either way. */
  same: number;
}

export interface BuydownAt {
  /** Payment savings so far. */
  saved: number;
  /** Extra principal paid down (0 when interest-only). */
  pay: number;
  /** Loan balance with no buy-down. */
  b0: number;
  /** Loan balance with the buy-down. */
  b1: number;
  /** saved + pay - upfront cost. */
  net: number;
}

export interface BuydownModel {
  o: BuydownInputs;
  /** Number of monthly payments. */
  n: number;
  /** Upfront cost of the buy-down. */
  up: number;
  p0: number;
  p1: number;
  /** Monthly payment savings. */
  save: number;
  /** Break-even in months on payment savings alone, or null when it never pays back. */
  be: number | null;
  at: (months: number) => BuydownAt;
}

export function num(s: unknown): number {
  const v = parseFloat(String(s == null ? "" : s).replace(/[^0-9.\-]/g, ""));
  return isFinite(v) ? v : 0;
}

export function pmt(L: number, r: number, n: number, io: boolean): number {
  if (io) return (L * r) / 12;
  const i = r / 12;
  if (i === 0) return L / n;
  return (L * i) / (1 - Math.pow(1 + i, -n));
}

export function balance(L: number, r: number, k: number, pm: number, io: boolean): number {
  if (io) return L;
  const i = r / 12;
  if (i === 0) return L - pm * k;
  const g = Math.pow(1 + i, k);
  return L * g - (pm * (g - 1)) / i;
}

export function model(o: BuydownInputs): BuydownModel {
  const n = Math.max(1, Math.round(o.T * 12));
  const up = o.L * o.pts + o.extra;
  const p0 = pmt(o.L, o.r0, n, o.io);
  const p1 = pmt(o.L, o.r1, n, o.io);
  const save = p0 - p1;
  return {
    o,
    n,
    up,
    p0,
    p1,
    save,
    be: save > 0 ? up / save : null,
    at(k: number): BuydownAt {
      const kk = Math.min(k, n);
      const saved = save * kk;
      const b0 = balance(o.L, o.r0, kk, p0, o.io);
      const b1 = balance(o.L, o.r1, kk, p1, o.io);
      const pay = o.io ? 0 : b0 - b1;
      return { saved, pay, b0, b1, net: saved + pay - up };
    },
  };
}

/** The month the net benefit (payment savings plus extra principal) first reaches zero, or null if it doesn't by `xmax`. */
export function netCross(m: BuydownModel, xmax: number): number | null {
  if (m.at(0).net >= 0) return 0;
  if (m.at(xmax).net < 0) return null;
  let lo = 0;
  let hi = xmax;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (m.at(mid).net >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function money(v: number, d = 0): string {
  const a = Math.abs(v);
  const s = a.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (Number(a.toFixed(d)) === 0) return "$" + s;
  return (v < 0 ? "-$" : "$") + s;
}

export function signed(v: number, d = 0): string {
  const s = money(Math.abs(v), d);
  if (Number(Math.abs(v).toFixed(d)) === 0) return s;
  return (v < 0 ? "-" : "+") + s;
}

export function monthsText(k: number | null): string {
  return k == null ? "Never" : (Math.round(k * 10) / 10).toString();
}

/** The verdict sentence, worded exactly as the workbook's own verdict cell. */
export function workbookVerdict(m: BuydownModel, hold: number): string {
  if (m.be === null) return "No monthly savings, so the buy-down never pays back";
  return m.at(hold).net >= 0 ? "The buy-down pays for itself before you exit" : "You exit before the buy-down pays back: skip it";
}

// ---- Chart geometry -------------------------------------------------------------------------------------
// Lines and areas are drawn in SVG; every piece of text is an HTML label placed by percentage over the drawing
// (so labels stay crisp and wrap-free at any width). This returns the numbers for both.

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return s * p;
}

function axisMoney(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1000 ? "$" + (Math.round(a / 100) / 10).toString() + "k" : "$" + Math.round(a);
  return (v < 0 ? "-" : "") + s;
}

/** Where an HTML label sits over the chart, as CSS percentages. */
export interface ChartPos {
  left?: string;
  right?: string;
  top: string;
  transform?: string;
}

export interface ChartSeries {
  m: BuydownModel;
  /** Shown at the right end of the line; leave empty for no label. */
  name: string;
}

export interface ChartPill {
  text: string;
  pos: ChartPos;
}

export interface BuydownChart {
  W: number;
  H: number;
  y0: number;
  xL: number;
  xR: number;
  yTicks: { y: number; label: string; pos: ChartPos }[];
  xTicks: { label: string; pos: ChartPos }[];
  /** One polyline per series, in the order given. */
  lines: string[];
  dots: { cx: number; cy: number; ahead: boolean }[];
  /** End-of-line names, one per named series: `series` is the index into the series given. */
  labels: { text: string; series: number; pos: ChartPos }[];
  negArea: string | null;
  posArea: string | null;
  /** Month the first series turns positive (0 = from day one, null = not within the chart). */
  cross: number | null;
  crossX: number | null;
  crossPill: ChartPill | null;
  hold: { x: number; dotY: number; pill: ChartPill } | null;
  zeroPos: ChartPos;
  negPos: ChartPos;
  posPos: ChartPos;
}

export function buildChart(
  series: ChartSeries[],
  xmax: number,
  holdK: number | null,
  dotKs: number[],
  withAreas: boolean,
  holdText: string,
  crossPrefix = "Pays back"
): BuydownChart {
  const W = 800;
  const H = 340;
  const PL = 64;
  const PR = 28;
  const PT = 44;
  const PB = 44;
  const step = Math.max(1, Math.ceil(xmax / 120));
  const ks: number[] = [];
  for (let k = 0; k <= xmax + 1e-9; k += step) ks.push(k);
  if (ks[ks.length - 1] < xmax) ks.push(xmax);
  let mn = 0;
  let mx = 0;
  for (const s of series) {
    for (const k of ks) {
      const v = s.m.at(k).net;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  if (mx === mn) mx = mn + 1000;
  const st = niceStep((mx - mn) / 5);
  const ymin = Math.floor(mn / st) * st;
  const ymax = Math.ceil(mx / st) * st;
  const X = (k: number) => PL + ((W - PL - PR) * k) / xmax;
  const Y = (v: number) => PT + ((H - PT - PB) * (ymax - v)) / (ymax - ymin);
  const f = (n: number) => Math.round(n * 10) / 10;
  const pc = (v: number) => (v * 100).toFixed(2) + "%";
  const at = (x: number, y: number, transform: string): ChartPos => ({ left: pc(x / W), top: pc(y / H), transform });
  const pill = (cx: number, y: number, text: string): ChartPill => {
    const w = Math.round(text.length * 7.4 + 28);
    const x = Math.max(PL, Math.min(W - PR - w, cx - w / 2));
    return { text, pos: at(x + w / 2, y + 13, "translate(-50%,-50%)") };
  };

  const yTicks: BuydownChart["yTicks"] = [];
  for (let v = ymin; v <= ymax + st / 1000; v += st) {
    yTicks.push({ y: f(Y(v)), label: axisMoney(v), pos: { right: pc(1 - (PL - 10) / W), top: pc(Y(v) / H), transform: "translateY(-50%)" } });
  }
  const xTicks: BuydownChart["xTicks"] = [];
  const xs = xmax > 120 ? 24 : 12;
  for (let q = 0; q <= xmax + 1e-9; q += xs) {
    xTicks.push({ label: q === 0 ? "Close" : q / 12 + " yr", pos: at(X(q), H - PB + 20, "translate(-50%,-50%)") });
  }
  const lines = series.map((s) => ks.map((k) => f(X(k)) + "," + f(Y(s.m.at(k).net))).join(" "));

  let negArea: string | null = null;
  let posArea: string | null = null;
  let cross: number | null = null;
  let crossX: number | null = null;
  let crossPill: ChartPill | null = null;
  if (withAreas) {
    const m = series[0].m;
    const kc = netCross(m, xmax);
    const arr = ks.slice();
    if (kc !== null && kc > 0 && arr.indexOf(kc) < 0) {
      arr.push(kc);
      arr.sort((a, b) => a - b);
    }
    const neg = arr.map((k) => f(X(k)) + "," + f(Y(Math.min(m.at(k).net, 0))));
    const pos = arr.map((k) => f(X(k)) + "," + f(Y(Math.max(m.at(k).net, 0))));
    const z0 = f(Y(0));
    const xa = f(X(arr[0]));
    const xb = f(X(arr[arr.length - 1]));
    negArea = neg.join(" ") + " " + xb + "," + z0 + " " + xa + "," + z0;
    posArea = pos.join(" ") + " " + xb + "," + z0 + " " + xa + "," + z0;
    cross = kc;
    crossX = kc === null ? null : f(X(kc));
    if (kc !== null && kc > 0) crossPill = pill(X(kc), Y(0) + 14, crossPrefix + " ~ month " + Math.round(kc));
  }

  const dots: BuydownChart["dots"] = [];
  for (const k of dotKs) {
    if (k > xmax) continue;
    const v = series[0].m.at(k).net;
    dots.push({ cx: f(X(k)), cy: f(Y(v)), ahead: v >= 0 });
  }

  const hold =
    holdK != null && holdK <= xmax
      ? { x: f(X(holdK)), dotY: f(Y(series[0].m.at(holdK).net)), pill: pill(X(holdK), 8, holdText) }
      : null;

  // Names at the right end of each line, nudged apart so they never sit on top of each other.
  const ends = series.map((s, i) => ({ i, y: Y(s.m.at(xmax).net), name: s.name }));
  ends.sort((a, b) => a.y - b.y);
  for (let e = 1; e < ends.length; e++) if (ends[e].y - ends[e - 1].y < 16) ends[e].y = ends[e - 1].y + 16;
  const labels = ends
    .filter((en) => en.name)
    .map((en) => ({ text: en.name, series: en.i, pos: { right: pc(1 - (W - PR - 6) / W), top: pc((en.y - 15) / H), transform: "translateY(-50%)" } }));

  return {
    W,
    H,
    y0: f(Y(0)),
    xL: PL,
    xR: W - PR,
    yTicks,
    xTicks,
    lines,
    dots,
    labels,
    negArea,
    posArea,
    cross,
    crossX,
    crossPill,
    hold,
    zeroPos: { left: pc((PL + 8) / W), top: pc((Y(0) - 14) / H) },
    negPos: { left: pc((PL + 10) / W), top: pc((H - PB - 16) / H) },
    posPos: { right: pc(1 - (W - PR - 4) / W), top: pc((Y(0) - 14) / H) },
  };
}
