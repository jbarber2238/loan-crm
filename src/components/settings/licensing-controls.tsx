"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { addLicenseState, removeLicenseState, saveLicensingDetails } from "@/server/actions/licensing";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isActionError } from "@/lib/action-result";
import { US_STATES, stateName } from "@/lib/us-states";
import type { LicensedBroker } from "@/lib/license-flag";

export function LicensingDetailsForm({ nmlsId, broker }: { nmlsId: string | null; broker: LicensedBroker | null }) {
  const router = useRouter();
  return (
    <ActionForm action={saveLicensingDetails} successMessage="Saved" onSuccess={() => router.refresh()} className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="nmlsId">Your company&apos;s NMLS ID</Label>
        <Input id="nmlsId" name="nmlsId" defaultValue={nmlsId ?? ""} placeholder="Leave blank if you don't hold a license" className="max-w-xs" />
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Licensed broker to close under</p>
          <p className="text-xs text-muted-foreground">
            Who you work with, under their license, on deals in the states below.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brokerName">Name</Label>
            <Input id="brokerName" name="brokerName" defaultValue={broker?.name ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brokerCompany">Company</Label>
            <Input id="brokerCompany" name="brokerCompany" defaultValue={broker?.company ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brokerPhone">Phone</Label>
            <Input id="brokerPhone" name="brokerPhone" type="tel" defaultValue={broker?.phone ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brokerEmail">Email</Label>
            <Input id="brokerEmail" name="brokerEmail" type="email" defaultValue={broker?.email ?? ""} placeholder="Add when you have it" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brokerNotes">Notes</Label>
          <Textarea
            id="brokerNotes"
            name="brokerNotes"
            rows={3}
            defaultValue={broker?.notes ?? ""}
            placeholder="Anything to remember: how you split compensation, how to hand a file off, which states he is licensed in…"
          />
        </div>
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

export function LicenseStatesEditor({ states }: { states: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const available = US_STATES.filter((s) => !states.includes(s.code));

  function run(fn: () => Promise<unknown>, success: string) {
    start(async () => {
      try {
        const result = await fn();
        if (isActionError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {states.length === 0 ? (
        <p className="text-sm text-muted-foreground">No states yet. Add the ones where closing a deal requires a license you don&apos;t hold.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {states.map((code) => (
            <li key={code} className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
              <span className="font-medium">{code}</span>
              <span className="text-muted-foreground">{stateName(code)}</span>
              <button
                type="button"
                aria-label={`Remove ${stateName(code)}`}
                disabled={pending}
                onClick={() => run(() => removeLicenseState(code), `${stateName(code)} removed`)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Add a state"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Add a state…</option>
          {available.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={pending || !pick}
          onClick={() => {
            const code = pick;
            setPick("");
            run(() => addLicenseState(code), `${stateName(code)} added`);
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
