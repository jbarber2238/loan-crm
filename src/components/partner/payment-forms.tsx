"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startPartnerW9, submitPartnerBanking, uploadPartnerBankingDocument } from "@/server/actions/partner-portal";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { isActionError } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const btnStyle = { backgroundColor: "#143D4A" };

/** Write-only: the numbers go in encrypted and are never shown back, to the partner or in the portal. */
export function BankingForm({ replacing }: { replacing: boolean }) {
  const router = useRouter();
  return (
    <ActionForm
      action={submitPartnerBanking}
      successMessage="Payment details received"
      onSuccess={() => router.refresh()}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="accountHolder">Name on the account</Label>
        <Input id="accountHolder" name="accountHolder" required autoComplete="off" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="routing">Routing number</Label>
          <Input id="routing" name="routing" inputMode="numeric" required autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account">Account number</Label>
          <Input id="account" name="account" inputMode="numeric" type="password" required autoComplete="off" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="accountType">Account type</Label>
        <Select name="accountType" required defaultValue="checking">
          <SelectTrigger id="accountType" className="w-full sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="checking">Checking</SelectItem>
            <SelectItem value="savings">Savings</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Encrypted the moment you submit. For your security we can&apos;t show these numbers back to you.
      </p>
      <SubmitButton style={btnStyle}>{replacing ? "Replace payment details" : "Submit payment details"}</SubmitButton>
    </ActionForm>
  );
}

export function BankingUploadForm() {
  const router = useRouter();
  const [kind, setKind] = useState("ach_instructions");
  return (
    <ActionForm
      action={uploadPartnerBankingDocument}
      successMessage="Document received"
      onSuccess={() => router.refresh()}
      className="space-y-4"
    >
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-1.5">
        <Label htmlFor="docKind">What are you uploading?</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger id="docKind" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ach_instructions">ACH instructions</SelectItem>
            <SelectItem value="voided_check">A voided check</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bankFile">File (PDF or image, up to 15MB)</Label>
        <Input id="bankFile" name="file" type="file" required accept=".pdf,image/*" />
      </div>
      <SubmitButton style={btnStyle}>Upload</SubmitButton>
    </ActionForm>
  );
}

export function W9Button() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      style={btnStyle}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await startPartnerW9();
            if (isActionError(result)) {
              toast.error(result.error);
              return;
            }
            const { url } = result;
            window.open(url, "_blank", "noopener");
            toast.success("Your W-9 opened in a new tab. Come back here once you've finished it.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't open the W-9 — try again in a moment.");
          }
        })
      }
    >
      {pending ? "Opening…" : "Complete your W-9"}
    </Button>
  );
}
