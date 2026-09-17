import Link from "next/link";
import { MannaIcon } from "@/components/marketing/manna-logo";

const TEAL = "#143D4A";

/**
 * Shared across every public marketing page so the legal disclosure and
 * contact info never drift between pages — edit here once, not per page.
 * The disclosure text itself is exact, attorney-facing legal copy Justin
 * provided directly; it must be reproduced verbatim, not paraphrased or
 * "cleaned up."
 */
export function SiteFooter() {
  return (
    <footer style={{ backgroundColor: TEAL }}>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div>
            <MannaIcon variant="reversed" className="h-8 w-8" />
            <p className="mt-4 text-xs leading-relaxed" style={{ color: "rgba(250,247,242,0.7)" }}>
              Lending nationwide — all 50 states.
            </p>
          </div>
          <div className="text-xs leading-relaxed" style={{ color: "rgba(250,247,242,0.7)" }}>
            <p>269-267-7506</p>
            <p>Monday – Friday, 9:00 AM – 5:00 PM EST</p>
          </div>
          <div className="text-xs leading-relaxed">
            <Link href="/resources" style={{ color: "rgba(250,247,242,0.7)" }} className="hover:underline">
              Investor Resources
            </Link>
            <br />
            <Link href="/privacy" style={{ color: "rgba(250,247,242,0.5)" }} className="hover:underline">
              Privacy Policy
            </Link>
            <br />
            <Link href="/sign-in" style={{ color: "rgba(250,247,242,0.5)" }} className="hover:underline">
              Team Login
            </Link>
          </div>
        </div>

        <p className="mt-8 border-t pt-6 text-xs tracking-wide" style={{ borderColor: "rgba(250,247,242,0.15)", color: "rgba(250,247,242,0.5)" }}>
          © {new Date().getFullYear()} Manna Lending. Private real estate lending for investors.
        </p>

        <div className="mt-6 space-y-3 border-t pt-6" style={{ borderColor: "rgba(250,247,242,0.15)" }}>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(250,247,242,0.55)" }}>
            Manna Lending is a lending brokerage, not a lender. We do not originate, fund, or service loans. We
            connect real estate investors with third-party licensed lenders. All loans are subject to
            underwriting approval by the funding lender, and rates, terms, and program availability are subject
            to change without notice. Nothing on this site constitutes a commitment to lend, an offer of
            credit, a rate lock, or an APR quote.
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(250,247,242,0.55)" }}>
            Investor / business-purpose loans only. Products described on this site (DSCR, hard money, new
            construction, bridge, portfolio) are intended exclusively for non-owner-occupied investment real
            estate held for business purposes. We do not arrange loans for primary residences, second homes, or
            any personal, family, or household purpose. We do not offer Qualified Mortgages or consumer
            mortgage products subject to TILA / RESPA / Regulation Z.
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(250,247,242,0.55)" }}>
            Manna Lending supports the principles of the Equal Credit Opportunity Act and the Fair Housing Act.
            We do not discriminate on the basis of race, color, religion, national origin, sex, marital status,
            age, disability, familial status, receipt of public assistance, or because any right under the
            Consumer Credit Protection Act has been exercised.
          </p>
        </div>
      </div>
    </footer>
  );
}
