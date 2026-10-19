import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { BecomePartnerForm } from "@/components/partner/become-partner-form";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Become a Partner — Manna Lending",
  description: "Refer investor deals to Manna Lending and get paid when they close.",
};

const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";
const MOSS = "#68735F";

const CARD_STYLE = {
  fontFamily: "var(--font-archivo), Archivo, sans-serif",
  backgroundColor: OFF_WHITE,
  color: BASALT,
  "--primary": TEAL,
  "--primary-foreground": OFF_WHITE,
  "--ring": TEAL,
  "--input": "#CBB8A099",
  "--border": "#CBB8A099",
  "--accent": "#CBB8A040",
  "--accent-foreground": TEAL,
} as CSSProperties;

export default function BecomePartnerPage() {
  return (
    <div className={archivo.variable} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />
      <div className="min-h-screen p-4 py-10 md:p-10" style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-md rounded-sm p-6 md:p-10" style={CARD_STYLE}>
          <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: MOSS }}>
            Partner program
          </p>
          <h1 className="mt-2 text-3xl leading-[1.1] font-normal">Become a partner.</h1>
          <p className="mt-4 text-sm leading-relaxed">
            Refer investor deals, watch every step of the loan in your own portal, and get paid when it closes. Enter your email
            and we&apos;ll send you a link to finish setting up.
          </p>
          <div className="mt-8">
            <BecomePartnerForm />
          </div>
          <p className="mt-6 text-xs" style={{ color: MOSS }}>
            Already a partner?{" "}
            <Link href="/partner/sign-in" className="underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
