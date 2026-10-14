import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TransactionalCalculator } from "@/components/transactional/transactional-calculator";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Transactional Funding — Manna Lending",
  description:
    "Short-term transactional funding for double closes (A-B / B-C). Public, up-front pricing from 1.00%, $100,000 minimum, same-day funding available.",
};

const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";
const LINE = "rgba(20,61,74,0.18)";
const REQUEST_HREF = "/transactional/request";

const TIERS = [
  {
    range: "$100,000 – $499,999",
    total: "1.25%",
    sameDay: "1.50%",
    example: "Example: $300,000 funding costs $3,750 total. Funded same day, $4,500 total.",
  },
  {
    range: "$500,000 – $1,000,000",
    total: "1.00%",
    sameDay: "1.25%",
    example: "Example: $600,000 funding costs $6,000 total.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Submit your request",
    body: "This is a direct request for funding, not a loan inquiry. Send the property, amount, closing date and your title company.",
  },
  {
    n: "02",
    title: "We take action",
    body: "Our team is alerted right away with every detail, and your cost is already calculated.",
  },
  {
    n: "03",
    title: "We coordinate with title",
    body: "We contact your title company and work with them directly to fund the A-B closing.",
  },
  {
    n: "04",
    title: "A-B closing funded",
    body: "Your first closing is funded, then you resell to your end buyer in the B-C.",
  },
];

function Eyebrow({ children, color = MOSS }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color }}>
      {children}
    </p>
  );
}

function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-sm px-7 py-3.5 text-xs font-medium tracking-[0.18em] text-white uppercase transition-opacity hover:opacity-90"
      style={{ backgroundColor: TEAL }}
    >
      {children}
    </Link>
  );
}

export default function TransactionalFundingPage() {
  return (
    <div className={archivo.variable} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      {/* Hero */}
      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6 pt-16 md:pt-20">
          <Eyebrow>Transactional funding</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.1] font-normal text-balance md:text-6xl" style={{ color: BASALT }}>
            We fund your double close.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed" style={{ color: BASALT }}>
            Short-term transactional funding for wholesale A-B / B-C deals. You need the money to close the A-B leg, then
            resell to your end buyer in a second closing. We fund these deals. Submit your request, and we coordinate with
            your title company to get the A-B closing funded.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryButton href={REQUEST_HREF}>Request funding</PrimaryButton>
            <a
              href="#pricing"
              className="inline-block rounded-sm border px-7 py-3.5 text-xs font-medium tracking-[0.18em] uppercase transition-opacity hover:opacity-80"
              style={{ borderColor: "rgba(20,61,74,0.4)", color: TEAL }}
            >
              See pricing
            </a>
          </div>
          <dl className="mt-12 grid grid-cols-1 gap-6 border-t py-8 sm:grid-cols-3" style={{ borderColor: LINE }}>
            {[
              ["From 1.00%", "Total cost on $500K–$1M"],
              ["$100,000", "Minimum funding amount"],
              ["+0.25%", "For same-day funding"],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="text-2xl md:text-3xl" style={{ color: BASALT }}>
                  {value}
                </dd>
                <dt className="mt-1 text-[11px]" style={{ color: MOSS }}>
                  {label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 01 — Pricing */}
      <section id="pricing" className="scroll-mt-4" style={{ backgroundColor: TEAL }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <Eyebrow color={SAND}>01 — Pricing</Eyebrow>
          <h2 className="mt-4 text-3xl leading-[1.1] font-normal md:text-4xl" style={{ color: OFF_WHITE }}>
            One flat cost, shown up front.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "rgba(250,247,242,0.85)" }}>
            Total cost to you is a percentage of the funding amount. No guessing at line items.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {TIERS.map((t) => (
              <div key={t.range} className="rounded-sm p-6" style={{ backgroundColor: "#FFFFFF" }}>
                <p className="text-[11px] font-medium tracking-[0.18em] uppercase" style={{ color: MOSS }}>
                  {t.range}
                </p>
                <div className="mt-4 flex gap-10">
                  <div>
                    <p className="text-4xl tabular-nums" style={{ color: TEAL }}>
                      {t.total}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: MOSS }}>
                      Total cost
                    </p>
                  </div>
                  <div>
                    <p className="text-4xl tabular-nums" style={{ color: TEAL }}>
                      {t.sameDay}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: MOSS }}>
                      Same-day funding
                    </p>
                  </div>
                </div>
                <p className="mt-5 border-t pt-4 text-sm" style={{ borderColor: LINE, color: BASALT }}>
                  {t.example}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs" style={{ color: "rgba(250,247,242,0.8)" }}>
            Minimum funding amount is $100,000. Same-day funding adds 0.25% to the total cost. Funding above $1,000,000 is
            priced individually.
          </p>
        </div>
      </section>

      {/* 02 — Calculator */}
      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:py-20">
          <div>
            <Eyebrow>02 — Your cost</Eyebrow>
            <h2 className="mt-4 text-3xl leading-[1.1] font-normal md:text-4xl" style={{ color: BASALT }}>
              Know the number before you request.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: BASALT }}>
              Enter your funding amount to see the total cost, calculated from the public pricing above.
            </p>
          </div>
          <TransactionalCalculator />
        </div>
      </section>

      {/* 03 — How it works */}
      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <Eyebrow color={TEAL}>03 — How it works</Eyebrow>
          <h2 className="mt-4 text-3xl leading-[1.1] font-normal md:text-4xl" style={{ color: BASALT }}>
            From request to funded, we handle it.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="text-sm font-medium" style={{ color: MOSS }}>
                  {s.n}
                </span>
                <h3 className="mt-2 text-lg font-medium" style={{ color: BASALT }}>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: BASALT }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 — Same-day */}
      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:py-20">
          <div>
            <Eyebrow>04 — Same-day funding</Eyebrow>
            <h2 className="mt-4 text-3xl leading-[1.1] font-normal md:text-4xl" style={{ color: BASALT }}>
              Your cost calculates automatically on the form.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: BASALT }}>
              Same-day pricing is applied for you, judged in Eastern time, so you always see your total cost before you
              submit.
            </p>
          </div>
          <div className="rounded-sm border bg-white p-6" style={{ borderColor: LINE }}>
            <p className="text-[11px] font-medium tracking-[0.18em] uppercase" style={{ color: MOSS }}>
              Applies when
            </p>
            <ul className="mt-4 space-y-3 text-sm" style={{ color: BASALT }}>
              <li>Your closing date is today, or</li>
              <li>Your request comes in at or after 4:00 PM Eastern the day before closing, or</li>
              <li>Your request comes in at or after 4:00 PM Eastern on Friday for a Monday closing.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section style={{ backgroundColor: TEAL }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-14">
          <div>
            <h2 className="text-2xl font-normal md:text-3xl" style={{ color: OFF_WHITE }}>
              Have a double close coming up?
            </h2>
            <p className="mt-2 text-sm" style={{ color: "rgba(250,247,242,0.85)" }}>
              It takes a few minutes to send us the details.
            </p>
          </div>
          <Link
            href={REQUEST_HREF}
            className="inline-block rounded-sm px-7 py-3.5 text-xs font-medium tracking-[0.18em] uppercase transition-opacity hover:opacity-90"
            style={{ backgroundColor: SAND, color: TEAL }}
          >
            Request funding
          </Link>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <p className="mx-auto max-w-6xl px-6 py-6 text-xs leading-relaxed" style={{ color: MOSS }}>
          Pricing is subject to change without notice. Transactional funding is for business-purpose real estate
          transactions only.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
