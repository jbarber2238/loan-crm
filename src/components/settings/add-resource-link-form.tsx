"use client";

import { useState } from "react";
import { addResourceLink } from "@/server/actions/settings";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The "add a link" row. Remounts after a successful add so the fields clear and a second click can't add a duplicate. */
export function AddResourceLinkForm({ hasLinks }: { hasLinks: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <ActionForm
      key={round}
      action={addResourceLink}
      successMessage="Link added"
      onSuccess={() => setRound((n) => n + 1)}
      className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="resource-title-new">{hasLinks ? "Add another: name" : "Name"}</Label>
        <Input id="resource-title-new" name="title" placeholder="Wire verification checklist" maxLength={120} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-url-new">Link</Label>
        <Input id="resource-url-new" name="url" placeholder="https://docs.google.com/document/d/..." required />
      </div>
      <SubmitButton>Add link</SubmitButton>
    </ActionForm>
  );
}
