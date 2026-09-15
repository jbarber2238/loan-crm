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

const PROGRAMS = [
  {
    name: "DSCR Loans",
    description:
      "Qualify on the property's cash flow, not your personal income. Purchase, cash-out, or rate-and-term refinance for long-term rentals.",
  },
  {
    name: "Fix & Flip",
    description:
      "Short-term capital for the purchase and rehab, sized against after-repair value — built for investors who move fast on a deal.",
  },
  {
    name: "Bridge Loans",
    description:
      "Purchase or refinance against a property's value today, when timing matters more than a long-term structure.",
  },
  {
    name: "Ground-Up Construction",
    description:
      "Financing to build vertically on land you own or are acquiring, sized against total project cost and after-repair value.",
  },
];

const STEPS = [
  { n: "01", title: "Submit your deal", body: "A short form on the property, the numbers, and your experience — five minutes, no obligation." },
  { n: "02", title: "Get matched and priced", body: "Your deal is checked against active lender programs and priced against real, current terms." },
  { n: "03", title: "Close on your timeline", body: "Underwriting moves at the pace of the deal, not a committee — because the capital is private." },
];

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
          <Link
            href={APPLY_HREF}
            className="rounded-sm px-5 py-2.5 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: TEAL }}
          >
            Apply Now
          </Link>
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
        </div>
      </section>

      {/* Programs */}
      <section id="programs" style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: MOSS }}>
            LOAN PROGRAMS
          </p>
          <h2 className="mt-3 text-2xl font-normal md:text-3xl" style={{ color: BASALT }}>
            Financing built around the deal, not a checklist.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
            {PROGRAMS.map((p) => (
              <div key={p.name} className="border-t pt-5" style={{ borderColor: "rgba(30,30,30,0.15)" }}>
                <h3 className="text-lg font-medium" style={{ color: TEAL }}>
                  {p.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: BASALT }}>
                  {p.description}
                </p>
              </div>
            ))}
          </div>
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
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-12 md:flex-row md:items-center">
          <MannaIcon variant="reversed" className="h-8 w-8" />
          <p className="text-xs tracking-wide" style={{ color: "rgba(250,247,242,0.7)" }}>
            © {new Date().getFullYear()} Manna Lending. Private real estate lending for investors.
          </p>
        </div>
      </footer>
    </div>
  );
}
