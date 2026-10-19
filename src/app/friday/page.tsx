import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads } from "@/server/db/schema";
import { SiteHeader } from "@/components/marketing/site-header";
import { FridayForm } from "@/components/marketing/friday-form";
import { MannaLogo } from "@/components/marketing/manna-logo";
import { formatSession, googleCalendarUrl, nextSessionDay } from "@/lib/friday-schedule";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "See It, Send It, Get Paid — Manna Lending",
  description: "A 30-minute Friday lunch Zoom: spot fundable investor deals and get paid for the introduction.",
};

// Per-visitor: shows the next session's date as of right now.
export const dynamic = "force-dynamic";

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

const LinkButton = ({ href, children, solid = false }: { href: string; children: React.ReactNode; solid?: boolean }) => (
  <a
    href={href}
    className="inline-block rounded-sm px-5 py-3 text-xs font-medium tracking-[0.14em] uppercase"
    style={solid ? { backgroundColor: TEAL, color: OFF_WHITE } : { border: `1px solid ${TEAL}`, color: TEAL }}
  >
    {children}
  </a>
);

export default async function FridayPage({ searchParams }: { searchParams: Promise<{ seat?: string }> }) {
  const { seat } = await searchParams;
  const seatLead =
    seat && /^[0-9a-f-]{36}$/i.test(seat)
      ? await db.query.leads.findFirst({
          where: eq(leads.id, seat),
          columns: { id: true, name: true, zoomJoinUrl: true, fridayBookedSessionDate: true },
        })
      : null;
  const day = seatLead?.fridayBookedSessionDate ?? nextSessionDay(new Date());
  const joinUrl = seatLead?.zoomJoinUrl ?? null;

  return (
    <div className={archivo.variable} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />
      <div className="min-h-screen p-4 py-10 md:p-10" style={{ backgroundColor: TEAL }}>
        {seatLead ? (
          <div className="mx-auto max-w-lg rounded-sm p-8" style={CARD_STYLE}>
            <MannaLogo className="h-10 w-auto" />
            <p className="mt-8 text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: MOSS }}>
              You&apos;re in
            </p>
            <h1 className="mt-2 text-3xl leading-[1.1] font-normal">{seatLead.name.split(/\s+/)[0]}, your seat is saved.</h1>
            <p className="mt-4 text-lg" style={{ color: TEAL }}>
              {formatSession(day)}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              See It, Send It, Get Paid is a 30-minute lunch Zoom. A confirmation with your personal join link is on its way to
              your inbox, and you&apos;ll get a reminder Friday morning.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {joinUrl && (
                <LinkButton href={joinUrl} solid>
                  Join the Zoom
                </LinkButton>
              )}
              <LinkButton href={googleCalendarUrl(day, joinUrl ?? "https://mannalendingco.com/friday")}>Add to Google Calendar</LinkButton>
              <LinkButton href={`/friday/calendar/${seatLead.id}`}>Download calendar file</LinkButton>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-xl rounded-sm p-6 md:p-10" style={CARD_STYLE}>
            <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: MOSS }}>
              Next session · {formatSession(day)}
            </p>
            <h1 className="mt-3 text-3xl leading-[1.1] font-normal md:text-4xl">See It, Send It, Get Paid.</h1>
            <p className="mt-1 text-lg" style={{ color: TEAL }}>
              A 30-minute Friday lunch Zoom.
            </p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed">
              For agents, lenders, property managers, CPAs, builders and investors who come across investor deals: learn how to spot
              the fundable ones and get paid for the introduction.
            </p>
            <div className="mt-8">
              <FridayForm />
            </div>
            <p className="mt-6 text-xs" style={{ color: MOSS }}>
              Already a partner?{" "}
              <Link href="/partner/sign-in" className="underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
