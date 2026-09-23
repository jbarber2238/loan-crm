import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Terms & Conditions — Manna Lending",
  description: "Manna Lending's terms of use, including our SMS messaging terms.",
};

const OFF_WHITE = "#FAF7F2";
const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const MOSS = "#68735F";

const EFFECTIVE_DATE = "September 22, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium" style={{ color: TEAL }}>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: BASALT }}>
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
            LEGAL
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl leading-[1.15] font-normal md:text-4xl" style={{ color: BASALT }}>
            Terms &amp; Conditions
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: BASALT }}>
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-3xl space-y-10 px-6 py-16 md:py-20">
          <Section title="Agreement to terms">
            <p>
              These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of Manna Lending&apos;s
              (&ldquo;Manna Lending,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) website and the loan inquiry
              services we offer. Manna Lending is a real estate lending brokerage — we connect real estate
              investors with third-party licensed lenders for business-purpose loans; we are not a lender and do
              not originate, fund, or service loans ourselves. By using our site or submitting a deal to us, you
              agree to these Terms.
            </p>
          </Section>

          <Section title="Our services">
            <p>
              Our website and CRM let you submit information about a real estate investment property and
              financing request so our team can match it against third-party lender guidelines and prepare
              pricing and term sheet estimates. Nothing on our site or in any communication from us constitutes a
              commitment to lend, an offer of credit, a rate lock, or an APR quote. All loans are subject to
              underwriting approval by the funding lender, and rates, terms, and program availability are
              subject to change without notice.
            </p>
          </Section>

          <Section title="SMS Terms">
            <p>
              If you provide your mobile phone number to Manna Lending — for example, on our loan inquiry form —
              you may opt in to receive text messages from Manna Lending about the deal you submitted:
              confirmations, status updates, requests for documents, and similar account-related messages.
              These are transactional messages about your own deal, not marketing or promotional messages.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Message frequency</strong> varies based on activity on your deal.
              </li>
              <li>
                <strong>Message and data rates may apply.</strong> Check with your mobile carrier for details on
                your plan.
              </li>
              <li>
                <strong>To opt out</strong> of text messages at any time, reply <strong>STOP</strong> to any
                message from us. You&apos;ll receive one final message confirming you&apos;ve been unsubscribed,
                and we won&apos;t text you again unless you opt back in.
              </li>
              <li>
                <strong>For help</strong>, reply <strong>HELP</strong> to any message from us, or contact us at{" "}
                <a href="tel:2692677506" style={{ color: TEAL }} className="underline">
                  269-267-7506
                </a>
                .
              </li>
              <li>
                Carriers are not liable for delayed or undelivered messages. We do not sell or share your SMS
                opt-in data or personal information with third parties for marketing purposes — see our{" "}
                <a href="/privacy" style={{ color: TEAL }} className="underline">
                  Privacy Policy
                </a>{" "}
                for how we handle your information.
              </li>
              <li>Supported carriers include all major U.S. wireless carriers. Not all carriers are covered.</li>
            </ul>
          </Section>

          <Section title="Acceptable use">
            <p>
              You agree to provide accurate information when submitting a deal, and not to use our site or
              services for any unlawful purpose or to misrepresent yourself, your entity, or the property or
              financing you&apos;re requesting.
            </p>
          </Section>

          <Section title="Intellectual property">
            <p>
              Our site, its content, and the Manna Lending name and logo are our property or used with
              permission, and may not be copied or used without our consent.
            </p>
          </Section>

          <Section title="Disclaimers">
            <p>
              Our site and services are provided &ldquo;as is&rdquo; without warranties of any kind. We do not
              guarantee that any submitted deal will be approved or funded by any lender. Manna Lending supports
              the principles of the Equal Credit Opportunity Act and the Fair Housing Act and does not
              discriminate on any basis those laws protect.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the fullest extent permitted by law, Manna Lending is not liable for any indirect, incidental,
              or consequential damages arising from your use of our site or services, including any lending
              decision made by a third-party lender.
            </p>
          </Section>

          <Section title="Changes to these Terms">
            <p>
              We may update these Terms from time to time. We&apos;ll post the revised version here with an
              updated effective date.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about these Terms? Reach us at{" "}
              <a href="tel:2692677506" style={{ color: TEAL }} className="underline">
                269-267-7506
              </a>
              , Monday–Friday, 9:00 AM–5:00 PM EST.
            </p>
          </Section>

          <p className="border-t pt-6 text-xs" style={{ borderColor: "rgba(20,61,74,0.15)", color: MOSS }}>
            Manna Lending is a lending brokerage, not a lender. See our full disclosures in the site footer.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
