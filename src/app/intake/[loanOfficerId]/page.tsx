import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { submitPublicIntake } from "@/server/actions/intake";
import { IntakeFormFields } from "@/components/deals/intake-form-fields";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getCompanyName } from "@/server/settings";

export default async function PublicIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ loanOfficerId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { loanOfficerId } = await params;
  const { submitted } = await searchParams;

  const loanOfficer = await db.query.users.findFirst({
    where: eq(users.id, loanOfficerId),
  });

  if (!loanOfficer || !loanOfficer.active) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This intake link isn&apos;t active. Please reach out to your loan officer directly.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted === "1") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Thanks — we&apos;ve got it</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loanOfficer.name} will follow up with you shortly.
          </CardContent>
        </Card>
      </div>
    );
  }

  const submitAction = submitPublicIntake.bind(null, loanOfficerId);
  const companyName = await getCompanyName();

  return (
    <div className="mx-auto max-w-2xl p-4 py-8 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Loan Inquiry — {companyName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Please complete this form to receive a pricing quote. Working with {loanOfficer.name}.
          </p>
        </CardHeader>
        <CardContent>
          <ActionForm action={submitAction} className="space-y-6">
            <IntakeFormFields />
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox name="marketingConsent" className="mt-0.5" />
              <span>
                By checking this box, I consent to receive emails and text messages from{" "}
                {companyName} regarding my service request and marketing and promotional
                messages, including special offers, discounts, and product updates.
              </span>
            </label>
            <SubmitButton className="w-full">Submit</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
