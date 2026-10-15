import { redirect } from "next/navigation";
import { requirePartner } from "@/server/partner/session";
import { PARTNER_TERMS, TERMS_VERSION } from "@/lib/partner-terms";
import { PartnerTermsForm } from "@/components/partner/partner-terms-form";

export default async function PartnerTermsPage() {
  const partner = await requirePartner({ allowTermsPending: true });
  const alreadyCurrent = partner.status === "active" && partner.termsVersion === TERMS_VERSION;
  if (alreadyCurrent) redirect("/partner");
  const reAccepting = partner.status === "active";

  return (
    <div className="mx-auto max-w-2xl rounded-sm border bg-white p-6 md:p-8">
      <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: "#68735F" }}>
        {reAccepting ? "Updated terms" : "Step 2 of 3 — Terms"}
      </p>
      <h1 className="mt-2 text-2xl font-normal md:text-3xl">How the partner program works</h1>
      <p className="mt-2 text-sm">
        {reAccepting
          ? "We've updated our terms. Please review and accept to keep using your portal. Nothing you've already earned changes."
          : "Plain language, so you know exactly how you're paid."}
      </p>
      <div className="mt-6 space-y-5">
        {PARTNER_TERMS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-medium">{section.heading}</h2>
            <div className="mt-1.5 space-y-2 text-sm leading-relaxed">
              {section.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-6 text-xs" style={{ color: "#68735F" }}>
        Version {TERMS_VERSION}
      </p>
      <div className="mt-4 border-t pt-4">
        <PartnerTermsForm />
      </div>
    </div>
  );
}
