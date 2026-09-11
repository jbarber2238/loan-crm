"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

function monthlyPI(loanAmount: number, annualRatePct: number, termYears: number, interestOnly: boolean) {
  const monthlyRate = annualRatePct / 100 / 12;
  if (interestOnly) return loanAmount * monthlyRate;
  const n = termYears * 12;
  if (monthlyRate === 0) return loanAmount / n;
  return (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
}

// Rough guide to how many lenders a DSCR can still be placed with: above 1.00
// is workable broadly, 0.80-1.00 narrows the field, below 0.80 only a couple
// of lenders will even look at it.
function dscrBadgeVariant(dscr: number): "success" | "warning" | "destructive" {
  if (dscr < 0.8) return "destructive";
  if (dscr <= 1) return "warning";
  return "success";
}

export function DscrCalculator({
  loanAmount,
  currentRent,
  annualTaxes,
  annualInsurance,
  annualHoa,
}: {
  loanAmount: number;
  currentRent: string | null;
  annualTaxes: string | null;
  annualInsurance: string | null;
  annualHoa: string | null;
}) {
  const [rent, setRent] = useState(currentRent ?? "");
  const [taxes, setTaxes] = useState(annualTaxes ?? "");
  const [insurance, setInsurance] = useState(annualInsurance ?? "");
  const [hoa, setHoa] = useState(annualHoa ?? "");
  const [rate, setRate] = useState("7.5");
  const [termYears, setTermYears] = useState("30");
  const [interestOnly, setInterestOnly] = useState(false);

  const parsedRent = Number(rent) || 0;
  const parsedRate = Number(rate) || 0;
  const parsedTerm = Number(termYears) || 30;
  const pAndI = loanAmount > 0 ? monthlyPI(loanAmount, parsedRate, parsedTerm, interestOnly) : 0;
  const monthlyTaxes = (Number(taxes) || 0) / 12;
  const monthlyInsurance = (Number(insurance) || 0) / 12;
  const monthlyHoa = (Number(hoa) || 0) / 12;
  const pitia = pAndI + monthlyTaxes + monthlyInsurance + monthlyHoa;
  const dscr = pitia > 0 ? parsedRent / pitia : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>DSCR Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          A scratchpad — try different rates without changing what&apos;s saved on the deal.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="dscrRent">Monthly rent</Label>
            <Input id="dscrRent" type="number" value={rent} onChange={(e) => setRent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dscrTaxes">Annual taxes</Label>
            <Input id="dscrTaxes" type="number" value={taxes} onChange={(e) => setTaxes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dscrInsurance">Annual insurance</Label>
            <Input
              id="dscrInsurance"
              type="number"
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dscrHoa">Annual HOA</Label>
            <Input id="dscrHoa" type="number" value={hoa} onChange={(e) => setHoa(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="dscrLoanAmount">Loan amount</Label>
            <Input id="dscrLoanAmount" type="number" value={loanAmount} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dscrRate">Interest rate %</Label>
            <Input id="dscrRate" type="number" step="0.125" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dscrTerm">Term (years)</Label>
            <Input
              id="dscrTerm"
              type="number"
              value={termYears}
              onChange={(e) => setTermYears(e.target.value)}
              disabled={interestOnly}
            />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={interestOnly}
                onCheckedChange={(v) => setInterestOnly(v === true)}
              />
              Interest-only
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/40 p-3 text-sm">
          <div>
            <span className="text-muted-foreground">Monthly P&amp;I: </span>
            {pAndI.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </div>
          <div>
            <span className="text-muted-foreground">Monthly PITIA: </span>
            {pitia.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">DSCR:</span>
            {dscr !== null ? (
              <Badge variant={dscrBadgeVariant(dscr)}>{dscr.toFixed(2)}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
