"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MergeFieldPicker } from "@/components/email-templates/merge-field-picker";
import { PROCESSOR_INTRO_TOKENS } from "@/lib/email-template-tokens";

// The three fields behind "Send Intro Email"/"Send Intro Text" on a deal —
// each processor writes their own rather than sharing one company-wide
// template, so this lives on My Profile (like the email signature) instead
// of the admin-only Email Templates page.
export function BorrowerIntroEditor({
  defaultSubject,
  defaultEmailBody,
  defaultTextBody,
}: {
  defaultSubject: string;
  defaultEmailBody: string;
  defaultTextBody: string;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [emailBody, setEmailBody] = useState(defaultEmailBody);
  const [textBody, setTextBody] = useState(defaultTextBody);
  const subjectRef = useRef<HTMLInputElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const textBodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="borrowerIntroEmailSubject">Intro email subject</Label>
          <MergeFieldPicker
            tokens={PROCESSOR_INTRO_TOKENS}
            targetRef={subjectRef}
            value={subject}
            onChange={setSubject}
          />
        </div>
        <Input
          id="borrowerIntroEmailSubject"
          name="borrowerIntroEmailSubject"
          ref={subjectRef}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Introducing myself as your loan processor"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="borrowerIntroEmailBody">Intro email body</Label>
          <MergeFieldPicker
            tokens={PROCESSOR_INTRO_TOKENS}
            targetRef={emailBodyRef}
            value={emailBody}
            onChange={setEmailBody}
          />
        </div>
        <Textarea
          id="borrowerIntroEmailBody"
          name="borrowerIntroEmailBody"
          ref={emailBodyRef}
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          rows={6}
          placeholder={"Hi {{borrowerFirstName}},\n\nMy name is {{senderName}} and I'll be processing your loan..."}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="borrowerIntroTextBody">Intro text message</Label>
          <MergeFieldPicker
            tokens={PROCESSOR_INTRO_TOKENS}
            targetRef={textBodyRef}
            value={textBody}
            onChange={setTextBody}
          />
        </div>
        <Textarea
          id="borrowerIntroTextBody"
          name="borrowerIntroTextBody"
          ref={textBodyRef}
          value={textBody}
          onChange={(e) => setTextBody(e.target.value)}
          rows={3}
          placeholder={"Hi {{borrowerFirstName}}, this is {{senderName}}, your loan processor at {{companyName}}..."}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}
