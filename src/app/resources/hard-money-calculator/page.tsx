import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { HardMoneyLeverageCalculator } from "@/components/marketing/loan-calculators";

export const metadata: Metadata = {
  title: "Hard Money Leverage Calculator — Manna Lending",
  description: "Estimate your max fix & flip or ground-up construction loan amount by LTC and LTARV.",
};

const OFF_WHITE = "#FAF7F2";
const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";

export default function HardMoneyCalculatorPage() {
  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
            INVESTOR RESOURCES
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl leading-[1.15] font-normal md:text-4xl" style={{ color: BASALT }}>
            <span className="block">Hard Money</span>
            <span className="block">Leverage Calculator</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: BASALT }}>
            The same math our own underwriting runs on — use it to size a fix &amp; flip, ground-up construction, or
            bridge loan before you ever submit an application.
          </p>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <HardMoneyLeverageCalculator />
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
