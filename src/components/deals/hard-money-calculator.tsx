"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function HardMoneyCalculator({
  purchasePrice,
  rehabCost,
  arv,
  loanAmount,
  budgetLabel,
}: {
  purchasePrice: string | null;
  rehabCost: string | null;
  arv: string | null;
  loanAmount: number;
  budgetLabel: "Rehab" | "Construction";
}) {
  const [price, setPrice] = useState(purchasePrice ?? "");
  const [rehab, setRehab] = useState(rehabCost ?? "");
  const [arvValue, setArvValue] = useState(arv ?? "");
  // Same defaults as the public Hard Money Leverage Calculator: 75% is what
  // most lenders quote as their ARV ceiling regardless of experience; 85% is
  // a reasonable "average investor" LTC starting point (90-100% needs a track
  // record).
  const [ltarvPct, setLtarvPct] = useState(75);
  const [ltcPct, setLtcPct] = useState(85);

  const parsedPrice = Number(price) || 0;
  const parsedRehab = Number(rehab) || 0;
  const parsedArv = Number(arvValue) || 0;
  const totalCost = price ? parsedPrice + parsedRehab : null;
  const maxByLtc = totalCost !== null && totalCost > 0 ? totalCost * (ltcPct / 100) : null;
  const maxByLtarv = parsedArv > 0 ? parsedArv * (ltarvPct / 100) : null;

  // A lender always offers the lower of the two constraints.
  let maxLoan: number | null = null;
  let binding: "LTC" | "LTARV" | null = null;
  if (maxByLtc !== null && maxByLtarv !== null) {
    if (maxByLtc <= maxByLtarv) {
      maxLoan = maxByLtc;
      binding = "LTC";
    } else {
      maxLoan = maxByLtarv;
      binding = "LTARV";
    }
  }
  const overMax = maxLoan !== null && loanAmount > maxLoan;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hard Money Leverage Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-muted-foreground">
          A scratchpad — try different LTARV/LTC ceilings without changing what&apos;s saved on the deal. A lender
          always offers the lower of the two.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hmPurchasePrice">Purchase Price</Label>
            <Input id="hmPurchasePrice" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hmRehabCost">{budgetLabel} Budget</Label>
            <Input id="hmRehabCost" type="number" value={rehab} onChange={(e) => setRehab(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hmArv">After-Repair Value (ARV)</Label>
            <Input id="hmArv" type="number" value={arvValue} onChange={(e) => setArvValue(e.target.value)} />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="hmLtarv">Loan-to-After-Repair Value (LTARV)</Label>
              <span className="text-sm font-medium">{ltarvPct}%</span>
            </div>
            <div className="mt-2 max-w-sm">
              <Slider id="hmLtarv" value={[ltarvPct]} onValueChange={([v]) => setLtarvPct(v)} min={50} max={75} step={5} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Most lenders cap ground-up and fix &amp; flip leverage at 75% of after-repair value, regardless of
              experience.
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="hmLtc">Loan-to-Cost (LTC)</Label>
              <span className="text-sm font-medium">{ltcPct}%</span>
            </div>
            <div className="mt-2 max-w-sm">
              <Slider id="hmLtc" value={[ltcPct]} onValueChange={([v]) => setLtcPct(v)} min={80} max={100} step={5} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              LTC is based on experience — a track record is typically needed to qualify for 90% or 100%; with less
              experience, expect somewhere between 80% and 85%.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/40 p-3 text-sm">
          <div>
            <span className="text-muted-foreground">Max by LTARV: </span>
            {maxByLtarv !== null ? money(maxByLtarv) : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Max by LTC: </span>
            {maxByLtc !== null ? money(maxByLtc) : "—"}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Requested loan amount: </span>
            {money(loanAmount)}
            {maxLoan !== null && (
              <Badge variant={overMax ? "destructive" : "success"}>
                {overMax ? `Exceeds max by ${binding}` : `Within max by ${binding}`}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
