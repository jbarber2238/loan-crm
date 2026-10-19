import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { TransactionalRequestForm } from "@/components/transactional/transactional-request-form";
import { MannaLogo } from "@/components/marketing/manna-logo";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Request Transactional Funding — Manna Lending",
};

const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";
const MOSS = "#68735F";

// Same re-theming as the DSCR intake card (branded-intake-form.tsx): the shadcn
// controls read these CSS variables, so the form matches the rest of the site.
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

export default async function TransactionalRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { submitted } = await searchParams;

  return (
    <div className={archivo.variable} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />
      <div className="min-h-screen p-4 py-10 md:p-10" style={{ backgroundColor: TEAL }}>
        {submitted === "1" ? (
          <div className="mx-auto max-w-md rounded-sm p-8 text-center" style={CARD_STYLE}>
            <MannaLogo className="mx-auto h-10 w-auto" />
            <h1 className="mt-6 text-xl font-medium" style={{ color: TEAL }}>
              Your funding request is in
            </h1>
            <p className="mt-2 text-sm leading-relaxed">
              Next, we&apos;ll contact your title company to coordinate funding the A-to-B portion of your transaction. If
              we need anything else from you, we&apos;ll reach out.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-sm p-6 md:p-10" style={CARD_STYLE}>
            <Link
              href="/transactional"
              className="text-[11px] font-medium tracking-[0.2em] uppercase underline underline-offset-4"
              style={{ color: TEAL }}
            >
              ← Transactional funding
            </Link>
            <p className="mt-6 text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: MOSS }}>
              Request funding
            </p>
            <h1 className="mt-2 text-3xl leading-[1.1] font-normal md:text-4xl">Tell us about your double close.</h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed">
              This is a direct request for funding, not a loan inquiry. When you submit, we take action and coordinate with
              your title company. For DSCR and hard money loans, use our{" "}
              <Link href="/intake/70b5d857-8139-48d2-bb92-9b7fd7862a3b" className="underline">
                standard application
              </Link>
              .
            </p>
            <div className="mt-8">
              <TransactionalRequestForm />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
