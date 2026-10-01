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
        <div className="mx-auto max-w-6xl px-6 py-6 md:py-7">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[11px] font-medium tracking-[0.2em]" style={{ color: TEAL }}>
              INVESTOR RESOURCES
            </p>
            <span className="hidden text-xs sm:inline" style={{ color: "rgba(30,30,30,0.4)" }}>
              ·
            </span>
            <p className="text-xs font-medium tracking-wide" style={{ color: TEAL }}>
              Max Allowable Offer Calculator
            </p>
          </div>
          <h1 className="mt-1.5 max-w-2xl text-xl leading-[1.2] font-normal md:text-2xl" style={{ color: BASALT }}>
            Know Your Numbers Before You Write an Offer
          </h1>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 py-10 md:py-12">
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
