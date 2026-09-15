// Insurance/title contact info lives directly on the deal row — gathered
// via the client-need "Mark Accepted" auto-fill or edited by hand on Roles
// and Key Contacts. Every email template category can reference it, so this
// is a standalone module (no other template-builder imports) to avoid a
// circular import between pricing-templates.ts, borrower-templates.ts, and
// vendor-templates.ts, which all need to merge these tokens in.
export function buildContactTemplateTokens(deal: {
  insuranceAgency: string | null;
  insuranceAgentName: string | null;
  insuranceAgentEmail: string | null;
  insuranceAgentPhone: string | null;
  titleCompanyAgentName: string | null;
  titleAgentEmail: string | null;
  titleAgentPhone: string | null;
}): Record<string, string> {
  return {
    insuranceAgency: deal.insuranceAgency ?? "Not provided",
    insuranceAgentName: deal.insuranceAgentName ?? "Not provided",
    insuranceAgentEmail: deal.insuranceAgentEmail ?? "Not provided",
    insuranceAgentPhone: deal.insuranceAgentPhone ?? "Not provided",
    titleCompanyAgentName: deal.titleCompanyAgentName ?? "Not provided",
    titleAgentEmail: deal.titleAgentEmail ?? "Not provided",
    titleAgentPhone: deal.titleAgentPhone ?? "Not provided",
  };
}
