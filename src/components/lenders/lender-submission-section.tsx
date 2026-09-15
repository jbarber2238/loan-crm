"use client";

import { useRef, useState } from "react";
import { updateLenderSubmission } from "@/server/actions/lenders";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MergeFieldPicker } from "@/components/email-templates/merge-field-picker";
import { ALL_DEAL_TOKENS } from "@/lib/email-template-tokens";

// Matches buildApplicationIntroTemplateTokens (src/server/vendor-templates.ts)
// exactly — every discrete deal field, plus these three.
const INTRO_EMAIL_TOKENS = [
  ...ALL_DEAL_TOKENS,
  { key: "repName", description: "Lender rep's first name" },
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "companyName", description: "Company name from Settings" },
];

export function LenderSubmissionSection({
  lenderId,
  quickPricerUrl,
  applicationSubmissionMethod,
  brokerPortalUrl,
  introEmailSubject,
  introEmailBody,
}: {
  lenderId: string;
  quickPricerUrl: string | null;
  applicationSubmissionMethod: "portal" | "email" | null;
  brokerPortalUrl: string | null;
  introEmailSubject: string | null;
  introEmailBody: string | null;
}) {
  const [method, setMethod] = useState<"portal" | "email">(applicationSubmissionMethod ?? "email");
  const [subject, setSubject] = useState(introEmailSubject ?? "");
  const [body, setBody] = useState(introEmailBody ?? "");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const updateSubmission = updateLenderSubmission.bind(null, lenderId);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Submission &amp; Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateSubmission} successMessage="Saved" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quickPricerUrl">Quick pricer link</Label>
              <Input
                id="quickPricerUrl"
                name="quickPricerUrl"
                type="url"
                defaultValue={quickPricerUrl ?? ""}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                If this lender has an instant pricing tool, paste the link here — the Pricing tab will offer
                it instead of drafting a pricing email.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applicationSubmissionMethod">How do they take full applications?</Label>
              <Select
                name="applicationSubmissionMethod"
                value={method}
                onValueChange={(v) => setMethod(v as "portal" | "email")}
              >
                <SelectTrigger id="applicationSubmissionMethod" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="portal">Broker portal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {method === "portal" && (
              <div className="space-y-1.5">
                <Label htmlFor="brokerPortalUrl">Broker portal link</Label>
                <Input
                  id="brokerPortalUrl"
                  name="brokerPortalUrl"
                  type="url"
                  defaultValue={brokerPortalUrl ?? ""}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">
                  &ldquo;Submit Application&rdquo; on a deal will take you straight here.
                </p>
              </div>
            )}
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {method === "email" && (
        <Card>
          <CardHeader>
            <CardTitle>Intro Email Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Used as the starting point when you click &ldquo;Submit Application&rdquo; on a deal with this lender. The
              line about the quoted rate, buydown, and origination fee is always added automatically below
              whatever you write here.
            </p>
            <ActionForm action={updateSubmission} successMessage="Template saved" className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="introEmailSubject">Subject</Label>
                  <MergeFieldPicker
                    tokens={INTRO_EMAIL_TOKENS}
                    targetRef={subjectRef}
                    value={subject}
                    onChange={setSubject}
                  />
                </div>
                <Input
                  id="introEmailSubject"
                  name="introEmailSubject"
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. New Loan Submission"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="introEmailBody">Body</Label>
                  <MergeFieldPicker tokens={INTRO_EMAIL_TOKENS} targetRef={bodyRef} value={body} onChange={setBody} />
                </div>
                <Textarea
                  id="introEmailBody"
                  name="introEmailBody"
                  ref={bodyRef}
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi [rep], please find our submission below..."
                />
              </div>
              <SubmitButton>Save Template</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </>
  );
}
