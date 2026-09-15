import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { MannaLogo, MannaIcon } from "@/components/marketing/manna-logo";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-archivo",
});

// The loan officer this site's "Apply" links route to — Justin himself,
// the only loan officer at the company today. Revisit if/when this needs
// to route by which staff member a lead actually belongs to.
const LOAN_OFFICER_ID = "70b5d857-8139-48d2-bb92-9b7fd7862a3b";
const APPLY_HREF = `/intake/${LOAN_OFFICER_ID}`;

export const metadata: Metadata = {
  title: "Manna Lending — DSCR & Hard Money Loans for Investors",
  description:
    "Private capital for real estate investors, underwritten on the strength of the deal rather than a lengthy approval process. DSCR and hard money loans, nationwide.",
};

const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

const STATS = [
  { value: "$60M+", label: "Funded to date" },
  { value: "50", label: "States we lend in" },
  { value: "Investor-run", label: "Not just a broker" },
];

const DSCR_PROGRAM = {
  name: "DSCR Rental Loans",
  subtitle: "Purchase | Cash-Out Refinance | Rate & Term Refinance",
  intro: "No tax returns. No income verification. We qualify the property, not your paycheck.",
  bullets: [
    "Loan amounts from $50K to $3.5M+ — single properties or full portfolios",
    "Up to 85% LTV on purchase, up to 80% on cash-out",
    "Credit flexibility down to 600 FICO, with no-ratio and negative-cash-flow options available",
    "30-year fixed and interest-only terms, with no-prepay options",
    "Eligible property types: single-family, 2-4 units, condos, condotels, manufactured homes, and 5-8+ unit multifamily",
    "Short-term rental income accepted using market data on qualifying purchase transactions",
    "Programs for foreign nationals and ITIN borrowers",
    "Niche coverage: co-living, rural properties, and first-time investors",
  ],
  bestFor: "Buy-and-hold investors who want to qualify on rental income rather than personal income.",
};

const BRIDGE_PROGRAM = {
  name: "Hard Money / Bridge Loans",
  subtitle: "Fix & Flip | Ground-Up Construction | Bridge Financing",
  intro: "Fast, flexible capital for investors who move quicker than traditional lending allows.",
  bullets: [
    "Loan amounts from $75K to $7M+, including larger construction and bridge deals",
    "Up to 100% of project cost on qualified flips",
    "Up to 90-95% loan-to-cost on light rehab and cosmetic renovation projects",
    "Up to 100% loan-to-cost on qualified ground-up construction projects",
    "Leverage up to 75% of after-repair or after-completion value",
    "No-experience-required construction financing for first-time builders, alongside high-leverage programs for seasoned investors",
    "Interest-only structures with no prepayment penalties",
    "Fast closings, including no-appraisal options on qualifying deals",
    "Straight bridge/acquisition, purchase + rehab, ground-up construction, and bridge-to-rent strategies — all under one roof",
  ],
  bestFor: "Investors flipping, building, or bridging into a stabilized rental exit.",
};

const STEPS = [
  { n: "01", title: "Submit your deal", body: "A short form on the property, the numbers, and your experience — five minutes, no obligation." },
  { n: "02", title: "Get matched and priced", body: "Your deal is checked against active lender programs and priced against real, current terms." },
  { n: "03", title: "Close on your timeline", body: "Underwriting moves at the pace of the deal, not a committee — because the capital is private." },
];

function ProgramCard({ program }: { program: typeof DSCR_PROGRAM }) {
  return (
    <div className="rounded-sm border bg-white p-7 md:p-9" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <h3 className="text-xl font-medium" style={{ color: TEAL }}>
        {program.name}
      </h3>
      <p className="mt-1.5 text-xs font-medium tracking-wide" style={{ color: MOSS }}>
        {program.subtitle}
      </p>
      <p className="mt-4 text-sm leading-relaxed" style={{ color: BASALT }}>
        {program.intro}
      </p>
      <p className="mt-5 text-xs font-medium tracking-[0.15em]" style={{ color: MOSS }}>
        WHAT WE OFFER
      </p>
      <ul className="mt-3 space-y-2">
        {program.bullets.map((b) => (
          <li key={b} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: BASALT }}>
            <span aria-hidden="true" style={{ color: TEAL }}>
              —
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t pt-4 text-sm leading-relaxed" style={{ borderColor: "rgba(20,61,74,0.15)", color: BASALT }}>
        <span className="font-medium" style={{ color: TEAL }}>
          Best for:
        </span>{" "}
        {program.bestFor}
      </p>
    </div>
  );
}

export default async function MarketingHomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/pipeline");
  }

  return (
    <div className={`${archivo.variable} font-sans`} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      {/* Header */}
      <header className="border-b" style={{ backgroundColor: OFF_WHITE, borderColor: "rgba(20,61,74,0.12)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <MannaLogo className="h-9 w-auto" />
          <nav className="flex items-center gap-6">
            <a href="#programs" className="hidden text-sm font-medium tracking-wide sm:inline" style={{ color: BASALT }}>
              Programs
            </a>
            <Link href="/resources" className="hidden text-sm font-medium tracking-wide sm:inline" style={{ color: BASALT }}>
              Resources
            </Link>
            <Link
              href={APPLY_HREF}
              className="rounded-sm px-5 py-2.5 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              Apply Now
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
              DSCR &amp; HARD MONEY LOANS
            </p>
            <h1
              className="mt-4 text-4xl leading-[1.1] font-normal text-balance md:text-5xl"
              style={{ color: BASALT }}
            >
              Capital that shows up when it&apos;s needed.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed md:text-lg" style={{ color: BASALT }}>
              Manna Lending provides private capital to real estate investors, underwritten on the
              strength of the deal rather than a lengthy approval process.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={APPLY_HREF}
                className="rounded-sm px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: TEAL }}
              >
                Get Pre-Qualified
              </Link>
              <a
                href="#programs"
                className="text-sm font-medium tracking-wide underline underline-offset-4"
                style={{ color: BASALT }}
              >
                See loan programs
              </a>
            </div>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-6 border-t pt-8" style={{ borderColor: "rgba(20,61,74,0.2)" }}>
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-medium md:text-3xl" style={{ color: TEAL }}>
                  {s.value}
                </p>
                <p className="mt-1 text-xs leading-snug" style={{ color: BASALT }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Programs */}
      <section id="programs" style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: MOSS }}>
            LOAN PROGRAMS
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-normal md:text-3xl" style={{ color: BASALT }}>
            We fund real estate investors — from your first rental to your next ground-up build.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: BASALT }}>
            Every deal is matched against our lending network to find the best fit for your credit, experience,
            and exit strategy.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ProgramCard program={DSCR_PROGRAM} />
            <ProgramCard program={BRIDGE_PROGRAM} />
          </div>
          <div className="mt-12 border-t pt-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
            <h3 className="text-lg font-medium" style={{ color: TEAL }}>
              One Lending Partner, Every Stage of the Deal
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: BASALT }}>
              From acquisition to stabilized rental, we structure financing across the full investment
              lifecycle — so you&apos;re not rebuilding a lender relationship every time your strategy changes.
            </p>
            <p className="mt-4 text-xs leading-relaxed" style={{ color: MOSS }}>
              Terms vary by program and are subject to underwriting approval. Contact us to discuss your
              specific scenario.
            </p>
          </div>
        </div>
      </section>

      {/* Why Manna */}
      <section style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: SAND }}>
            WHY MANNA LENDING
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-normal md:text-3xl" style={{ color: OFF_WHITE }}>
            Run by an investor, not just a broker.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: "rgba(250,247,242,0.85)" }}>
            Many brokers have never invested in real estate themselves. Manna Lending has. We own multiple
            doors, so we understand the pain and the upside of different financing structures firsthand — and
            how to underwrite a deal so it actually works, not just how to process an application.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
            HOW IT WORKS
          </p>
          <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="text-sm font-medium" style={{ color: MOSS }}>
                  {s.n}
                </span>
                <h3 className="mt-2 text-lg font-medium" style={{ color: BASALT }}>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: BASALT }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-14">
            <Link
              href={APPLY_HREF}
              className="rounded-sm px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              Start Your Application
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
            <div>
              <MannaIcon variant="reversed" className="h-8 w-8" />
              <p className="mt-4 text-xs leading-relaxed" style={{ color: "rgba(250,247,242,0.7)" }}>
                Lending nationwide — all 50 states.
              </p>
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "rgba(250,247,242,0.7)" }}>
              <p>269-267-7506</p>
              <p>Monday – Friday, 9:00 AM – 5:00 PM EST</p>
            </div>
            <div className="text-xs leading-relaxed">
              <Link href="/resources" style={{ color: "rgba(250,247,242,0.7)" }} className="hover:underline">
                Investor Resources
              </Link>
              <br />
              <Link href="/sign-in" style={{ color: "rgba(250,247,242,0.5)" }} className="hover:underline">
                Team Login
              </Link>
            </div>
          </div>
          <p className="mt-8 border-t pt-6 text-xs tracking-wide" style={{ borderColor: "rgba(250,247,242,0.15)", color: "rgba(250,247,242,0.5)" }}>
            © {new Date().getFullYear()} Manna Lending. Private real estate lending for investors.
          </p>
        </div>
      </footer>
    </div>
  );
}
