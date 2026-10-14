import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TransactionalIntakeForm } from "@/components/transactional/transactional-intake-form";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Transactional Funding Request — Manna Lending",
};

const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

export default async function TransactionalIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { submitted } = await searchParams;

  return (
    <div className={`${archivo.variable}`} style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />
      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-2xl px-6 py-14">
          {submitted === "1" ? (
            <div className="space-y-3 text-center">
              <h1 className="text-3xl font-normal" style={{ color: BASALT }}>
                Thanks — we&apos;ve got it.
              </h1>
              <p className="text-base leading-relaxed" style={{ color: BASALT }}>
                Your funding request is in. Next, we&apos;ll contact your title company to coordinate funding the A-to-B
                portion of your transaction. If we need anything else from you, we&apos;ll reach out.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: TEAL }}>
                Transactional funding
              </p>
              <h1 className="mt-3 text-3xl font-normal md:text-4xl" style={{ color: BASALT }}>
                Double close funding request
              </h1>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: BASALT }}>
                This is a formal request for funding, not a request for pricing. Our pricing is published on our
                website, so you&apos;ll know the cost before you submit.
              </p>
              <div className="mt-8">
                <TransactionalIntakeForm />
              </div>
            </>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
