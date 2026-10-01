import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { UnsubscribeButton } from "@/components/marketing/unsubscribe-button";

export const metadata: Metadata = {
  title: "Unsubscribe — Manna Lending",
  description: "Unsubscribe from marketing emails from Manna Lending.",
};

const OFF_WHITE = "#FAF7F2";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";

export default async function UnsubscribePage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;

  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="text-2xl font-normal" style={{ color: TEAL }}>
            Unsubscribe from marketing emails
          </h1>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: BASALT }}>
            Confirm below and we&apos;ll stop sending you marketing emails like calculator follow-ups. This won&apos;t
            affect access to any tool you&apos;ve already unlocked, or direct outreach about a deal you&apos;re
            actively working with us on.
          </p>
          <div className="mt-8 flex justify-center">
            <UnsubscribeButton leadId={leadId} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
