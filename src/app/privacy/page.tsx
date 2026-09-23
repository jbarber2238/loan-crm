import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Manna Lending",
  description: "How Manna Lending collects, uses, and protects information.",
};

const OFF_WHITE = "#FAF7F2";
const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const BASALT = "#1E1E1E";
const MOSS = "#68735F";

const EFFECTIVE_DATE = "September 17, 2026";

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

export default function PrivacyPolicyPage() {
  return (
    <div style={{ fontFamily: "var(--font-archivo), Archivo, sans-serif" }}>
      <SiteHeader />

      <section style={{ backgroundColor: SAND }}>
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-xs font-medium tracking-[0.2em]" style={{ color: TEAL }}>
            LEGAL
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl leading-[1.15] font-normal md:text-4xl" style={{ color: BASALT }}>
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: BASALT }}>
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      <section style={{ backgroundColor: OFF_WHITE }}>
        <div className="mx-auto max-w-3xl space-y-10 px-6 py-16 md:py-20">
          <Section title="Who we are">
            <p>
              Manna Lending (&ldquo;Manna Lending,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is a real estate
              lending brokerage. We connect real estate investors with third-party licensed lenders for
              business-purpose loans — we are not a lender, and we do not originate, fund, or service loans
              ourselves. This policy explains what information we collect through our website and CRM, how we
              use it, and the choices you have.
            </p>
          </Section>

          <Section title="Information we collect">
            <p>
              <strong>From borrowers and investors who submit a deal to us:</strong> your name, contact
              information, and details about the property and financing you&apos;re requesting; information about
              your real estate investing experience; and documents you or your team choose to upload as part of
              underwriting (for example, bank statements, entity documents, insurance information, or purchase
              contracts).
            </p>
            <p>
              <strong>From visitors to our website:</strong> standard technical information your browser sends
              automatically, such as pages visited and general device/browser information.
            </p>
            <p>
              <strong>From our own staff:</strong> when a team member signs in with their work Google account,
              we receive their name, email address, and profile photo from Google, and — with their explicit
              permission during that sign-in — access to send email from their own Google account on their
              behalf (for example, sending pricing requests to lenders or updates to borrowers). We do not
              access, read, or store the contents of anyone&apos;s Gmail inbox.
            </p>
          </Section>

          <Section title="How we use information">
            <p>We use the information above to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Match a submitted deal against lender guidelines and prepare pricing and term sheet estimates</li>
              <li>Communicate with you about your deal, including by phone, email, or the scheduling links our team provides</li>
              <li>Share deal and underwriting information with the third-party lender(s) you&apos;re being matched with, as necessary to obtain financing on your behalf</li>
              <li>Generate documents such as term sheets and underwriting packages, including through service providers we use for e-signature and document generation</li>
              <li>Operate, secure, and improve our website and internal systems</li>
              <li>Meet our own legal, tax, and recordkeeping obligations</li>
            </ul>
            <p>We do not sell personal information.</p>
          </Section>

          <Section title="How we share information">
            <p>We share information only as needed to do the things above, specifically with:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>The third-party licensed lender(s) actively underwriting your deal</li>
              <li>Service providers who process data on our behalf under contract — for example, document and e-signature processing, payment processing, and email delivery through Google Workspace</li>
              <li>Professional advisors (such as accountants or attorneys) or regulators, when required by law</li>
            </ul>
            <p>We do not share your information with unrelated third parties for their own marketing purposes.</p>
            <p>
              <strong>SMS/text messaging:</strong> if you provide your phone number and opt in to receive text
              messages from us about your deal, we use that number solely to communicate with you about the deal
              you submitted. No mobile information will be shared with third parties/affiliates for marketing or
              promotional purposes. Text messaging originator opt-in data and consent will not be shared with any
              third parties. See our{" "}
              <a href="/terms" className="underline" style={{ color: TEAL }}>
                Terms &amp; Conditions
              </a>{" "}
              for our full SMS terms, including how to opt out.
            </p>
          </Section>

          <Section title="Google user data">
            <p>
              Manna Lending&apos;s use and transfer of information received from Google APIs to any other app
              will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: TEAL }}
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Access granted by a staff member&apos;s Google account is
              used solely to send email on that staff member&apos;s behalf from within our CRM, and for nothing
              else.
            </p>
          </Section>

          <Section title="Data retention">
            <p>
              We retain deal and underwriting information for as long as needed to service your request, satisfy
              our recordkeeping obligations, and support any ongoing lending relationship, after which it is
              deleted or de-identified unless we&apos;re required to retain it longer by law.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use reasonable administrative and technical safeguards to protect information in our care.
              No method of transmission or storage is completely secure, and we cannot guarantee absolute
              security.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              To ask what information we hold about you, or to request that it be corrected or deleted, contact
              us using the information below. We&apos;ll honor requests except where we&apos;re required to keep
              information for legal, regulatory, or legitimate business recordkeeping reasons.
            </p>
          </Section>

          <Section title="Children">
            <p>Our services are intended for businesses and individuals age 18 and older, not children.</p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. We&apos;ll post the revised version here with an
              updated effective date.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this policy or your information? Reach us at{" "}
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
