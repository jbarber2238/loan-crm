import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { EmailTemplateCard } from "@/components/email-templates/email-template-card";
import { NewEmailTemplateDialog } from "@/components/email-templates/new-email-template-dialog";
import { CollapsibleGroupList } from "@/components/email-templates/collapsible-group-list";

export default async function EmailTemplatesPage() {
  await requireAdmin();

  const templates = await db.query.emailTemplates.findMany({
    orderBy: (t, { asc }) => asc(t.name),
  });

  const pricingTemplates = templates.filter((t) => t.category === "pricing_request");
  const borrowerTemplates = templates.filter((t) => t.category === "borrower_lifecycle");
  const vendorTemplates = templates.filter((t) =>
    ["insurance_request", "title_request", "application_submission"].includes(t.category)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Email Templates</h1>
        <p className="text-sm text-muted-foreground">
          Edit the wording sent out at every step — pricing requests today, borrower emails as they get built.
        </p>
      </div>

      <CollapsibleGroupList
        groups={[
          {
            key: "pricing",
            title: "Pricing Requests",
            description: "Sent to lender reps when you price a deal. Merge fields fill in automatically from the deal.",
            children: (
              <div className="space-y-2" key="pricing-list">
                {pricingTemplates.map((t) => (
                  <EmailTemplateCard key={t.id} template={t} />
                ))}
              </div>
            ),
          },
          {
            key: "vendor",
            title: "Insurance, Title & Lender Submission",
            description:
              "Sent when ordering insurance/title on a deal or submitting an application to a lender. Merge fields fill in automatically from the deal.",
            children: (
              <div className="space-y-2" key="vendor-list">
                {vendorTemplates.map((t) => (
                  <EmailTemplateCard key={t.id} template={t} />
                ))}
              </div>
            ),
          },
          {
            key: "borrower",
            title: "Borrower Lifecycle Emails",
            description:
              "Emails to the borrower at a given pipeline stage — content lives here now; automated sending gets wired up later.",
            headerExtra: <NewEmailTemplateDialog key="new-email-template" />,
            children: (
              <div className="space-y-2" key="borrower-list">
                {borrowerTemplates.map((t) => (
                  <EmailTemplateCard key={t.id} template={t} />
                ))}
                {borrowerTemplates.length === 0 && (
                  <p className="text-sm text-muted-foreground">No borrower email templates yet.</p>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
