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

const TRACK_RECORD = [
  { value: "$60M+", label: "Funded to date" },
  { value: "50", label: "States we lend in" },
];

const HOW_WE_LEND = ["No Tax Returns Required", "No Income Verification", "No Prepayment Penalty"];

const PROGRAMS = [
  {
    name: "DSCR Purchase",
    image: "https://images.unsplash.com/photo-1625603736199-775425d2890a?auto=format&fit=crop&w=800&q=80",
    bullets: ["$50K–$3.5M loan amounts", "Up to 85% LTV", "600 FICO minimum", "30-yr fixed or interest-only"],
  },
  {
    name: "DSCR Cash-Out Refi",
    image: "https://images.unsplash.com/photo-1646446528565-c7c4f2e759a0?auto=format&fit=crop&w=800&q=80",
    bullets: ["Up to 80% LTV", "$50K–$3.5M loan amounts", "600 FICO minimum", "No income verification"],
  },
  {
    name: "DSCR Rate & Term Refi",
    image: "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=800&q=80",
    bullets: ["Reprice an existing loan", "$50K–$3.5M loan amounts", "600 FICO minimum", "30-yr fixed or interest-only"],
  },
  {
    name: "Fix & Flip",
    image: "https://images.unsplash.com/photo-1618832515490-e181c4794a45?auto=format&fit=crop&w=800&q=80",
    bullets: ["$75K–$7M+ loan amounts", "Up to 100% of project cost", "90–95% LTC on light rehab", "Interest-only, no prepay"],
  },
  {
    name: "Ground-Up Construction",
    image: "https://images.unsplash.com/photo-1778438387124-b304a43a710b?auto=format&fit=crop&w=800&q=80",
    bullets: ["$75K–$7M+ loan amounts", "Up to 100% loan-to-cost", "75% of after-completion value", "No experience required"],
  },
  {
    name: "Bridge Financing",
    image: "https://images.unsplash.com/photo-1782024743263-bb153ea077e1?auto=format&fit=crop&w=800&q=80",
    bullets: ["$75K–$7M+ loan amounts", "Fast, flexible closings", "Purchase, rehab, or bridge-to-rent", "No appraisal on qualifying deals"],
  },
];

const STEPS = [
  { n: "01", title: "Submit your deal", body: "A short form on the property, the numbers, and your experience — five minutes, no obligation." },
  { n: "02", title: "Get matched and priced", body: "Your deal is checked against active lender programs and priced against real, current terms." },
  { n: "03", title: "Close on your timeline", body: "Underwriting moves at the pace of the deal, not a committee — because the capital is private." },
];

function ProgramCard({ program }: { program: (typeof PROGRAMS)[number] }) {
  return (
    <div className="overflow-hidden rounded-sm border bg-white" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <div
        className="h-20 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(0deg, rgba(20,61,74,0.2), rgba(20,61,74,0.05)), url('${program.image}')`,
        }}
        role="img"
        aria-label={program.name}
      />
      <div className="p-5">
        <h3 className="text-base font-medium" style={{ color: TEAL }}>
          {program.name}
        </h3>
        <ul className="mt-2.5 space-y-1">
          {program.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-xs leading-snug" style={{ color: BASALT }}>
              <span aria-hidden="true" style={{ color: TEAL }}>
                —
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
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

      {/* Hero — a real property behind the pitch, not another flat color
          block; every competitor site we looked at leads with a photo. */}
      <section
        className="relative bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(100deg, rgba(20,61,74,0.94) 0%, rgba(20,61,74,0.86) 38%, rgba(20,61,74,0.45) 75%), url('https://images.unsplash.com/photo-1577618163295-29d57a40e2b2?auto=format&fit=crop&w=2400&q=80')",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.2em]" style={{ color: SAND }}>
              DSCR &amp; HARD MONEY LOANS
            </p>
            <h1
              className="mt-4 text-4xl leading-[1.1] font-normal text-balance md:text-5xl"
              style={{ color: OFF_WHITE }}
            >
              Capital that shows up when it&apos;s needed.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed md:text-lg" style={{ color: "rgba(250,247,242,0.88)" }}>
              Manna Lending provides private capital to real estate investors, underwritten on the
              strength of the deal rather than a lengthy approval process.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={APPLY_HREF}
                className="rounded-sm px-7 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90"
                style={{ backgroundColor: SAND, color: TEAL }}
              >
                Get Quick Pricing
              </Link>
              <a
                href="#programs"
                className="text-sm font-medium tracking-wide underline underline-offset-4"
                style={{ color: OFF_WHITE }}
              >
                See loan programs
              </a>
            </div>
          </div>

          <div className="mt-16 border-t pt-8" style={{ borderColor: "rgba(250,247,242,0.25)" }}>
            <div className="grid grid-cols-2 gap-6 sm:w-fit sm:grid-cols-2 sm:gap-16">
              {TRACK_RECORD.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-medium md:text-3xl" style={{ color: SAND }}>
                    {s.value}
                  </p>
                  <p className="mt-1 text-xs leading-snug" style={{ color: "rgba(250,247,242,0.85)" }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:flex-wrap sm:gap-x-10 sm:gap-y-3" style={{ borderColor: "rgba(250,247,242,0.15)" }}>
              {HOW_WE_LEND.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <span aria-hidden="true" style={{ color: SAND }}>
                    ✓
                  </span>
                  <span className="text-sm font-medium" style={{ color: OFF_WHITE }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
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
          <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-3">
            {PROGRAMS.map((program) => (
              <ProgramCard key={program.name} program={program} />
            ))}
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
            The access of a broker. The eye of an investor.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: "rgba(250,247,242,0.85)" }}>
            Manna Lending is run by an active real estate investor — someone who owns multiple doors and has
            felt the pain and the upside of different financing structures firsthand. That experience shapes
            every deal we place: full access to our lending network, underwritten by someone who knows how to
            structure a deal so it actually works.
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
