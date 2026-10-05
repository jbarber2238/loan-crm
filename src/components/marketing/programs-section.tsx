import Link from "next/link";

const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";
const CARD_CREAM = "#F4EFE6";
const LINE = "rgba(20,61,74,0.18)";

const STATS = [
  { value: "$75K–$5M", label: "Typical loan sizes" },
  { value: "Up to 80%", label: "DSCR leverage" },
  { value: "Up to 100%", label: "Of cost, with experience" },
  { value: "660+", label: "Typical minimum FICO" },
];

const DSCR_COLUMNS = ["Purchase", "Rate & term refi", "Cash-out refi"];
const DSCR_ROWS: { label: string; values: string[] }[] = [
  { label: "Loan amount", values: ["$100K–$3M", "$100K–$3M", "$100K–$3M"] },
  { label: "Max LTV", values: ["Up to 80%", "Up to 75–80%", "Up to 75%"] },
  { label: "Min FICO", values: ["660–680", "660–680", "660–700"] },
  { label: "Min DSCR", values: ["1.00, sub-1.00 options", "1.00, sub-1.00 options", "1.00, sub-1.00 options"] },
  { label: "Cash to borrower", values: ["n/a", "About $5K or less", "$500K–$1M cap"] },
];

interface DetailCard {
  title: string;
  subtitle: string;
  rows: { label: string; value: string }[];
}

const DSCR_CARDS: DetailCard[] = [
  {
    title: "Portfolio / blanket",
    subtitle: "One note, many rentals.",
    rows: [
      { label: "Properties", value: "2 to 25+" },
      { label: "Loan amount", value: "$200K–$4M total" },
      { label: "Max LTV", value: "65–75%" },
      { label: "FICO / DSCR", value: "660–680 · 1.00" },
    ],
  },
  {
    title: "5–10 unit multifamily",
    subtitle: "Larger rentals, same approach.",
    rows: [
      { label: "Loan amount", value: "$350K–$3M" },
      { label: "Max LTV", value: "65–75%" },
      { label: "FICO / DSCR", value: "680+ · 1.00+" },
    ],
  },
];

const DSCR_TAGS = ["Short-term rental", "Foreign national", "Condo & condotel", "Rural", "Interest-only", "Step-down prepay"];

const HARD_MONEY_CARDS: DetailCard[] = [
  {
    title: "Fix and flip",
    subtitle: "Buy, renovate, sell or refinance.",
    rows: [
      { label: "Loan amount", value: "$75K–$3M" },
      { label: "Max LTC", value: "Up to 100% with experience" },
      { label: "Max ARV", value: "70–75%" },
      { label: "Min FICO", value: "660" },
      { label: "Term", value: "12 months, extends to 18–24" },
      { label: "Rehab budget", value: "100% financed and drawn" },
    ],
  },
  {
    title: "Ground-up construction",
    subtitle: "Build from the ground up.",
    rows: [
      { label: "Loan amount", value: "$200K–$3M" },
      { label: "Max LTC", value: "Up to 100% with experience" },
      { label: "Max ARV", value: "65–75%" },
      { label: "Min FICO", value: "660–680" },
      { label: "Term", value: "12–24 months" },
      { label: "Construction budget", value: "100% financed and drawn" },
    ],
  },
  {
    title: "Bridge purchase or refi",
    subtitle: "Little or no rehab.",
    rows: [
      { label: "Loan amount", value: "$100K–$5M" },
      { label: "Max LTV", value: "70–75% of as-is" },
      { label: "Cash-out refi", value: "65–75%" },
      { label: "Min FICO", value: "660–675" },
      { label: "Term", value: "12–24 months" },
      { label: "Experience", value: "Not required at most" },
    ],
  },
];

function Eyebrow({ children, color = MOSS }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color }}>
      {children}
    </p>
  );
}

function DetailCardView({ card, dark = false }: { card: DetailCard; dark?: boolean }) {
  return (
    <div
      className="rounded-sm border p-5"
      style={dark ? { backgroundColor: CARD_CREAM, borderColor: "transparent" } : { backgroundColor: "#FFFFFF", borderColor: LINE }}
    >
      <h3 className="text-lg font-normal" style={{ color: TEAL }}>
        {card.title}
      </h3>
      <p className="mt-1 text-xs" style={{ color: BASALT }}>
        {card.subtitle}
      </p>
      <dl className="mt-3">
        {card.rows.map((r) => (
          <div key={r.label} className="border-t py-2" style={{ borderColor: LINE }}>
            <dt className="text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: MOSS }}>
              {r.label}
            </dt>
            <dd className="mt-0.5 text-sm" style={{ color: BASALT }}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The homepage's `#programs` section — what the header's "Programs" link
 * scrolls to. Ranges are typical and vary by borrower, property, loan size
 * and state (see the disclaimer at the bottom).
 */
export function ProgramsSection({ applyHref }: { applyHref: string }) {
  return (
    <section id="programs" className="scroll-mt-4">
      {/* Intro + stats */}
      <div style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 pt-16 md:pt-20">
          <div className="border-y py-12 md:py-14" style={{ borderColor: LINE }}>
            <Eyebrow>Loan programs</Eyebrow>
            <h2 className="mt-4 max-w-3xl text-4xl leading-[1.1] font-normal text-balance md:text-5xl" style={{ color: BASALT }}>
              Loans built around the deal.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed" style={{ color: BASALT }}>
              DSCR and hard money financing for real estate investors, from your first rental to your next ground-up
              build. Every deal is matched to the right lending partner for your credit, experience and exit.
            </p>
            <Link
              href={applyHref}
              className="mt-7 inline-block rounded-sm px-6 py-3.5 text-xs font-medium tracking-[0.14em] text-white uppercase transition-opacity hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              Submit a deal
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 border md:grid-cols-4" style={{ borderColor: LINE, backgroundColor: "#FFFFFF" }}>
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`p-5 ${i % 2 === 1 ? "border-l" : ""} ${i > 1 ? "border-t md:border-t-0" : ""} ${i > 0 ? "md:border-l" : ""}`}
                style={{ borderColor: LINE }}
              >
                <p className="text-2xl md:text-3xl" style={{ color: TEAL }}>
                  {s.value}
                </p>
                <p className="mt-2 text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: MOSS }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 01 — DSCR */}
      <div style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:py-20 lg:grid-cols-[2fr_3fr] lg:gap-14">
          <div>
            <Eyebrow>01 — DSCR loans</Eyebrow>
            <h3 className="mt-4 text-4xl leading-[1.1] font-normal md:text-5xl" style={{ color: BASALT }}>
              Qualify on the rent.
            </h3>
            <p className="mt-5 max-w-sm text-sm leading-relaxed" style={{ color: BASALT }}>
              Long-term rental financing underwritten on the property&apos;s cash flow. 30-year fixed or ARM terms, with
              interest-only available.
            </p>
            <Link
              href={applyHref}
              className="mt-7 inline-block rounded-sm px-6 py-3.5 text-xs font-medium tracking-[0.14em] text-white uppercase transition-opacity hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              Get quick pricing
            </Link>
          </div>

          <div className="min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm" style={{ color: BASALT }}>
                <thead>
                  <tr style={{ backgroundColor: TEAL, color: OFF_WHITE }}>
                    <th className="w-[28%] p-3" />
                    {DSCR_COLUMNS.map((c) => (
                      <th key={c} scope="col" className="border-l p-3 text-left text-[10px] font-medium tracking-[0.14em] uppercase" style={{ borderColor: "rgba(250,247,242,0.2)" }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DSCR_ROWS.map((row) => (
                    <tr key={row.label} className="border-b" style={{ borderColor: LINE, backgroundColor: "#FFFFFF" }}>
                      <th scope="row" className="p-3 text-left text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: MOSS }}>
                        {row.label}
                      </th>
                      {row.values.map((v, i) => (
                        <td key={i} className="border-l p-3" style={{ borderColor: LINE }}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {DSCR_CARDS.map((c) => (
                <DetailCardView key={c.title} card={c} />
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-16 md:pb-20">
          <ul className="flex flex-wrap gap-3">
            {DSCR_TAGS.map((t) => (
              <li key={t} className="rounded-sm border px-3 py-1.5 text-xs" style={{ borderColor: TEAL, color: TEAL, backgroundColor: "#FFFFFF" }}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 02 — Hard money */}
      <div style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-6 md:grid-cols-2 md:items-end">
            <div>
              <Eyebrow color={SAND}>02 — Hard money loans</Eyebrow>
              <h3 className="mt-4 text-4xl leading-[1.1] font-normal md:text-5xl" style={{ color: OFF_WHITE }}>
                Capital that shows up.
              </h3>
            </div>
            <p className="max-w-md text-sm leading-relaxed md:justify-self-end" style={{ color: "rgba(250,247,242,0.88)" }}>
              Short-term loans for flips, new builds and bridge deals, with the rehab or construction budget held back
              and drawn as the work gets done.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {HARD_MONEY_CARDS.map((c) => (
              <DetailCardView key={c.title} card={c} dark />
            ))}
          </div>

          <div className="mt-10 grid gap-6 border-t pt-6 text-sm md:grid-cols-2" style={{ borderColor: "rgba(250,247,242,0.2)", color: OFF_WHITE }}>
            <div>
              <Eyebrow color={SAND}>Every hard money loan</Eyebrow>
              <p className="mt-2">Interest-only · No prepay at most · SFR, 2–4 unit, condo · LLC or corporation borrower</p>
            </div>
            <div>
              <Eyebrow color={SAND}>Also ask about</Eyebrow>
              <p className="mt-2">Jumbo to $5M · Commercial and 5+ unit bridge · Foreign national</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: OFF_WHITE }}>
        <p className="mx-auto max-w-6xl px-6 py-6 text-xs leading-relaxed" style={{ color: MOSS }}>
          Ranges shown are typical and vary by borrower, property, loan size and state. Not a commitment to lend.
          Business-purpose loans only. Subject to underwriting approval.
        </p>
      </div>
    </section>
  );
}
