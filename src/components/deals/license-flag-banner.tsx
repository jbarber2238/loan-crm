import { AlertTriangle } from "lucide-react";
import type { LicenseFlag } from "@/lib/license-flag";

/** The alert at the top of a deal in a state that requires a license to close. */
export function LicenseFlagBanner({ flag }: { flag: LicenseFlag }) {
  const broker = flag.broker;
  const contact = broker ? [broker.name, broker.company].filter(Boolean).join(" · ") : null;
  const reach = broker ? [broker.phone, broker.email].filter(Boolean).join(" · ") : null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div className="space-y-0.5">
        <p className="font-semibold">License required: {flag.stateName}</p>
        <p>
          Closing a deal in {flag.stateName} requires a license we don&apos;t hold.{" "}
          {broker ? (
            <>
              Close it under <span className="font-medium">{contact}</span>
              {reach ? <> ({reach})</> : null}, and settle your compensation split before you commit to pricing.
            </>
          ) : (
            <>Set up a licensed broker in Settings → Licensing, and settle your compensation split before you commit to pricing.</>
          )}
        </p>
        {broker?.notes && <p className="text-amber-900/80">Note: {broker.notes}</p>}
      </div>
    </div>
  );
}
