"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DSCR_MIN_CLOSING_DAYS, dscrClosingTooSoon, submittedGapPhrase } from "@/lib/closing-timeline";

/**
 * The Overview's estimated closing date. On a DSCR loan, a date closer than the minimum (measured from when the deal
 * was submitted) is flagged right under the field, and the flag follows the date as it is edited.
 */
export function EstimatedClosingDateField({
  defaultValue,
  loanCategory,
  submittedOn,
}: {
  defaultValue: string;
  loanCategory: string;
  /** "YYYY-MM-DD" in Eastern Time: the day the deal came in. */
  submittedOn: string;
}) {
  const [date, setDate] = useState(defaultValue);
  const days = dscrClosingTooSoon(loanCategory, date, submittedOn);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="estimatedClosingDate">Estimated closing date</Label>
      <Input id="estimatedClosingDate" name="estimatedClosingDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {days !== null && (
        <p
          className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          role="status"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {submittedGapPhrase(days)} DSCR loans typically take a minimum of {DSCR_MIN_CLOSING_DAYS} days, so the borrower will likely need an
            extension to 35 to 45 days.
          </span>
        </p>
      )}
    </div>
  );
}
