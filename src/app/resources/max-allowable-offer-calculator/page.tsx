import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { MaxOfferCalculatorGate } from "@/components/marketing/max-offer-calculator-gate";

export const metadata: Metadata = {
  title: "Max Allowable Offer Calculator — Manna Lending",
  description: "Build your fix & flip offer, leverage, carrying costs, and profit margin in one place — free, instant access.",
};

const OFF_WHITE = "#FAF7F2";
const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";

export default async function MaxOfferCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead } = await searchParams;

  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
            INVESTOR RESOURCES
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl leading-[1.15] font-normal md:text-4xl" style={{ color: BASALT }}>
            Know Your Numbers Before You Write an Offer
          </h1>
          <p className="mt-3 text-sm font-medium tracking-wide" style={{ color: TEAL }}>
            Max Allowable Offer Calculator
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: BASALT }}>
            Run the whole deal — offer price, leverage, carrying costs, holding costs, and closing costs — and see
            your real profit margin before you ever write an offer.
          </p>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-4xl px-6 py-16 md:py-20">
          <MaxOfferCalculatorGate leadIdFromUrl={lead} />
        </div>
      </section>

      <div style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-6xl px-6 pt-10">
          <p className="text-xs" style={{ color: "rgba(250,247,242,0.7)" }}>
            This calculator is an estimate for planning purposes only and is not a quote, pre-qualification, or
            commitment to lend. Terms vary by program and are subject to underwriting approval.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
