"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";
import { useState } from "react";
import { monthsOwned, ownedSentence, parseMonthInput } from "@/lib/borrower-experience";

/** The Overview's "Single rental purchased" month, with the same live "owned about N months" line the borrower saw. */
export function SingleRentalPurchasedField({ defaultValue, numRentals }: { defaultValue: string; numRentals: number | null }) {
  const [month, setMonth] = useState(defaultValue);
  const since = parseMonthInput(month);
  const months = since ? monthsOwned(since) : null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="singleRentalPurchaseDate">Single rental purchased</Label>
      <Input id="singleRentalPurchaseDate" name="singleRentalPurchaseDate" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      {months !== null && (
        <p className={cn("text-sm font-medium", months < 0 ? "text-destructive" : "text-primary")} suppressHydrationWarning>
          {ownedSentence(months).replace("You have owned it", "Owned")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {numRentals === 1 ? "The borrower has one rental, so lenders look at how long it has been owned." : "Only kept when # of rentals is 1."}
      </p>
    </div>
  );
}
