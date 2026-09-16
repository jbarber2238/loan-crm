import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Investor Resources — Manna Lending",
  description: "Free DSCR and hard money leverage calculators for real estate investors, from Manna Lending.",
};

const OFF_WHITE = "#FAF7F2";
const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const MOSS = "#68735F";

const CALCULATORS = [
  {
    nameLines: ["DSCR Calculator"],
    href: "/resources/dscr-calculator",
    description:
      "See whether a rental property's income covers its debt — the core number a DSCR loan qualifies against instead of your personal income.",
  },
  {
    nameLines: ["Hard Money", "Leverage Calculator"],
    href: "/resources/hard-money-calculator",
    description:
      "Size a fix & flip, ground-up construction, or bridge loan by both Loan-to-Cost and Loan-to-After-Repair Value, and see which one a lender will use.",
  },
];

export default function ResourcesPage() {
  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
            INVESTOR RESOURCES
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl leading-[1.15] font-normal md:text-4xl" style={{ color: BASALT }}>
            The numbers behind your next deal, explained.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: BASALT }}>
            The same math our own underwriting runs on — use it to size a deal before you ever submit an
            application.
          </p>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {CALCULATORS.map((calc) => (
              <Link
                key={calc.href}
                href={calc.href}
                className="rounded-sm border bg-white p-6 shadow-[0_8px_24px_rgba(20,61,74,0.08)] transition-shadow hover:shadow-[0_8px_24px_rgba(20,61,74,0.16)] md:p-8"
                style={{ borderColor: "rgba(20,61,74,0.15)" }}
              >
                <h2 className="text-lg font-medium" style={{ color: TEAL }}>
                  {calc.nameLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: BASALT }}>
                  {calc.description}
                </p>
                <span className="mt-4 inline-block text-sm font-medium tracking-wide" style={{ color: MOSS }}>
                  Open calculator →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
