import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { MannaLogo } from "@/components/marketing/manna-logo";
import { getSessionPartner } from "@/server/partner/session";
import { partnerSignOut } from "@/server/actions/partner-portal";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Partner Portal — Manna Lending",
  robots: { index: false },
};

const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

// Same shadcn re-theming as the public intake forms, so portal forms match the site.
const THEME = {
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

export default async function PartnerLayout({ children }: { children: ReactNode }) {
  const partner = await getSessionPartner();

  return (
    <div className={`${archivo.variable} min-h-screen`} style={THEME}>
      <header className="border-b" style={{ borderColor: "rgba(20,61,74,0.12)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href={partner ? "/partner" : "/partner/sign-in"}>
            <MannaLogo className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-xs font-medium tracking-[0.18em] uppercase sm:inline" style={{ color: "#68735F" }}>
              Partner portal
            </span>
            {partner && partner.passwordHash && (
              <>
                <Link href="/partner?how=1" className="underline underline-offset-4" style={{ color: TEAL }}>
                  How you get paid
                </Link>
                <span className="hidden sm:inline">Hi {(partner.name ?? "").split(/\s+/)[0] || "there"}</span>
                <form action={partnerSignOut}>
                  <button type="submit" className="underline underline-offset-4" style={{ color: TEAL }}>
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-[11px]" style={{ color: "#68735F" }}>
        Manna Lending is a DBA of VESBA Creative Capital LLC. Business-purpose loans only. Examples are illustrations; all terms are subject to underwriting.
      </footer>
    </div>
  );
}
