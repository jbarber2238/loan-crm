import type { Metadata } from "next";
import { Archivo, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { BuydownCalculator } from "@/components/marketing/buydown-calculator";

export const metadata: Metadata = {
  title: "Rate Buy-Down Calculator — Manna Lending",
  description: "Is paying points worth it? Enter your loan quote and how long you plan to hold it, and see the month a lower rate pays you back.",
};

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-archivo" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-source-serif" });

const OFF_WHITE = "#FAF7F2";
const TEAL = "#143D4A";
const MOSS = "#68735F";
const SERIF = "var(--font-source-serif), 'Source Serif 4', Georgia, serif";

export default function RateBuydownCalculatorPage() {
  return (
    <div className={`${archivo.variable} ${sourceSerif.variable}`} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <main style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
          <div className="flex flex-col gap-3 pb-2">
            <p className="m-0 text-xs leading-4 font-semibold tracking-[0.14em] uppercase" style={{ color: MOSS }}>
              Investor resources · Rate buy-down calculator
            </p>
            <h1 className="m-0 max-w-[780px] text-[32px] leading-[38px] font-medium text-balance sm:text-[44px] sm:leading-[50px]" style={{ fontFamily: SERIF, color: TEAL }}>
              Is paying points worth it for your deal?
            </h1>
            <p className="m-0 max-w-[640px] text-[17px] leading-[26px]" style={{ color: "#3b463a" }}>
              Enter your loan quote and how long you plan to hold it. You will see the month a lower rate pays you back.
            </p>
          </div>

          <BuydownCalculator />
        </div>
      </main>

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
