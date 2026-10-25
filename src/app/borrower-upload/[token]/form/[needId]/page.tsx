import Link from "next/link";
import { getCustomFormNeed, submitCustomFormAnswers } from "@/server/actions/borrower-upload";
import { getCustomFormDefinition } from "@/lib/custom-need-forms/registry";
import { CustomNeedFormRenderer } from "@/components/borrower-upload/custom-need-form-renderer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalLook } from "@/server/settings";
import { PortalFrame } from "@/components/borrower-upload/portal-frame";

export default async function CustomNeedFormPage({
  params,
}: {
  params: Promise<{ token: string; needId: string }>;
}) {
  const { token, needId } = await params;
  const [data, look] = await Promise.all([getCustomFormNeed(token, needId), getPortalLook()]);
  const { theme, logo, companyName } = look;

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This link isn&apos;t valid. Please reach out to your loan officer for a new one.
          </CardContent>
        </Card>
      </div>
    );
  }

  const definition = getCustomFormDefinition(data.need.customFormKey);
  if (!definition) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This form isn&apos;t set up correctly. Please reach out to your loan officer.
          </CardContent>
        </Card>
      </div>
    );
  }

  async function submitAction(formData: FormData) {
    "use server";
    await submitCustomFormAnswers(token, needId, formData);
  }

  const muted = theme ? "bp-muted" : "text-primary-foreground/70";
  const mutedStrong = theme ? "bp-muted" : "text-primary-foreground/80";

  return (
    <PortalFrame
      theme={theme}
      logo={logo}
      companyName={companyName}
      headerExtra={
        <>
          <h1 className="mt-3 text-xl font-semibold text-balance">{definition.label}</h1>
          {data.need.description && <p className={`mt-1 text-sm ${mutedStrong}`}>{data.need.description}</p>}
          <p className={`mt-3 text-xs ${muted}`}>
            {data.dealSummary.propertyAddress} · Loan #{data.dealSummary.loanNumber}
          </p>
        </>
      }
    >
      {data.need.status === "accepted" ? (
        <p className="text-sm text-muted-foreground">
          This has already been submitted and accepted — nothing left to do here.
        </p>
      ) : (
        <ActionForm action={submitAction} className="space-y-8">
          <CustomNeedFormRenderer definition={definition} defaultValues={data.defaultValues} />
          <SubmitButton className="w-full bp-primary">Submit</SubmitButton>
        </ActionForm>
      )}
      <Link href={`/borrower-upload/${token}`} className="block text-center text-xs text-muted-foreground underline">
        Back to your checklist
      </Link>
    </PortalFrame>
  );
}
