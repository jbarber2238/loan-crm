import type { ReactNode } from "react";
import { getDealForBorrowerUpload } from "@/server/actions/borrower-upload";
import { BorrowerUploadNeedRow, AcceptedNeedRow } from "@/components/borrower-upload/borrower-upload-need-row";
import { Card, CardContent } from "@/components/ui/card";
import { PipelineStepper } from "@/components/deals/pipeline-stepper";
import { getCompanyName } from "@/server/settings";

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          {completed} of {total} complete
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</p>
  );
}

export default async function BorrowerUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deal = await getDealForBorrowerUpload(token);
  const companyName = await getCompanyName();

  if (!deal) {
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

  const total = deal.needs.length;
  const acceptedNeeds = deal.needs.filter((n) => n.status === "accepted");
  const submittedNeeds = deal.needs.filter((n) => n.status === "review_needed");
  const neededNeeds = deal.needs.filter((n) => n.status === "not_sent" || n.status === "awaiting_docs");
  // Documents first within "needed" so the most common action type leads.
  const orderedNeeded = [
    ...neededNeeds.filter((n) => n.needType === "document_upload"),
    ...neededNeeds.filter((n) => n.needType !== "document_upload"),
  ];
  const allDone = total > 0 && neededNeeds.length === 0 && submittedNeeds.length === 0;

  const headline =
    total === 0
      ? `Hi ${deal.borrowerFirstName}, you're all caught up`
      : allDone
        ? `Nice work, ${deal.borrowerFirstName} — you're all done!`
        : `Let's get you to the finish line, ${deal.borrowerFirstName}`;

  const subheadline =
    total === 0
      ? "Nothing outstanding right now."
      : allDone
        ? "Everything below has been submitted and accepted."
        : "Here's what's left to complete before we can move your loan forward.";

  return (
    <div className="mx-auto max-w-2xl p-4 py-8 md:p-8">
      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="bg-primary px-6 py-6 text-primary-foreground md:px-8">
          <p className="text-xs font-semibold text-primary-foreground/70 uppercase tracking-wide">{companyName}</p>
          <h1 className="mt-1 text-xl font-semibold text-balance">{headline}</h1>
          <p className="mt-1 text-sm text-primary-foreground/80">{subheadline}</p>
          <p className="mt-3 text-xs text-primary-foreground/70">
            {deal.propertyAddress} · Loan #{deal.loanNumber}
          </p>
        </div>

        <div className="space-y-6 bg-card p-6 md:p-8">
          {deal.showPipeline && (
            <div className="space-y-2">
              <SectionLabel>Where your loan is</SectionLabel>
              <PipelineStepper stage={deal.pipelineStage} pausedFromStage={null} />
            </div>
          )}

          {total > 0 && <ProgressBar completed={acceptedNeeds.length} total={total} />}

          {orderedNeeded.length > 0 && (
            <div className="space-y-3">
              {(submittedNeeds.length > 0 || acceptedNeeds.length > 0) && <SectionLabel>To do</SectionLabel>}
              {orderedNeeded.map((need) => (
                <BorrowerUploadNeedRow key={need.id} token={token} need={need} />
              ))}
            </div>
          )}

          {submittedNeeds.length > 0 && (
            <div className="space-y-3">
              <SectionLabel>Submitted — under review</SectionLabel>
              {submittedNeeds.map((need) => (
                <BorrowerUploadNeedRow key={need.id} token={token} need={need} />
              ))}
            </div>
          )}

          {acceptedNeeds.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Completed</SectionLabel>
              {acceptedNeeds.map((need) => (
                <AcceptedNeedRow key={need.id} need={need} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
