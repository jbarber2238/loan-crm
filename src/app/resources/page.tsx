import type { Metadata } from "next";
import Link from "next/link";
import { MannaLogo } from "@/components/marketing/manna-logo";
import { SiteFooter } from "@/components/marketing/site-footer";
import { DscrCalculator, LtarvCalculator, LtcCalculator } from "@/components/marketing/loan-calculators";

export const metadata: Metadata = {
  title: "Investor Resources — Manna Lending",
  description: "Free DSCR, LTC, and LTARV calculators for real estate investors, from Manna Lending.",
};

const OFF_WHITE = "#FAF7F2";
const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";

export default function ResourcesPage() {
  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <header className="border-b" style={{ backgroundColor: OFF_WHITE, borderColor: "rgba(20,61,74,0.12)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/">
            <MannaLogo className="h-9 w-auto" />
          </Link>
          <Link href="/" className="text-sm font-medium tracking-wide" style={{ color: TEAL }}>
            ← Back to home
          </Link>
        </div>
      </header>

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
        <div className="mx-auto max-w-6xl space-y-8 px-6 py-16 md:py-20">
          <DscrCalculator />
          <LtcCalculator />
          <LtarvCalculator />
        </div>
      </section>

      <div style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-6xl px-6 pt-10">
          <p className="text-xs" style={{ color: "rgba(250,247,242,0.7)" }}>
            These calculators are estimates for planning purposes only and are not a quote, pre-qualification, or
            commitment to lend. Terms vary by program and are subject to underwriting approval.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
