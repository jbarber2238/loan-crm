"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddRecipientMenu } from "@/components/emails/add-recipient-menu";
import { addRecipient, type RecipientCandidate } from "@/lib/email-recipients";

/** One To:/Cc: row — an editable, comma-separated address field plus a "+ Add" picker. */
export function RecipientLine({
  id,
  label,
  value,
  onChange,
  candidates,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  candidates: RecipientCandidate[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <AddRecipientMenu candidates={candidates} onAdd={(email) => onChange(addRecipient(value, email))} />
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
