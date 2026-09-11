"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runValueAssessmentAction } from "@/server/actions/ai-assessments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REFINANCE_CATEGORIES = new Set(["dscr_cash_out_refinance", "dscr_rate_term_refinance", "bridge_refinance"]);
const PURCHASE_CATEGORIES = new Set(["dscr_purchase", "bridge_purchase"]);
const ARV_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

interface ValueAssessment {
  low: number | null;
  median: number | null;
  high: number | null;
  note: string | null;
  ranAt: string;
}

function money(n: number | null): string {
  return n !== null ? `$${n.toLocaleString()}` : "—";
}

export function AiValueAssessmentSection({
  dealId,
  loanCategory,
  purchasePrice,
  estimatedAsIsValue,
  estimatedArv,
  initialResult,
}: {
  dealId: string;
  loanCategory: string;
  purchasePrice: number | null;
  estimatedAsIsValue: number | null;
  estimatedArv: number | null;
  initialResult: ValueAssessment | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState(initialResult);

  const isArv = ARV_CATEGORIES.has(loanCategory);
  const isPurchase = PURCHASE_CATEGORIES.has(loanCategory);
  const isRefinance = REFINANCE_CATEGORIES.has(loanCategory);

  // Portfolio (multiple properties) isn't a fit for a single-address lookup — not supported yet.
  if (!isArv && !isPurchase && !isRefinance) return null;

  function handleRun() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runValueAssessmentAction(dealId);
        setResult(r);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't run the value assessment.");
      }
    });
  }

  const borrowerLine = isArv
    ? `ARV: ${money(estimatedArv)}`
    : isPurchase
      ? `Purchase price: ${money(purchasePrice)}, As-Is Value: ${money(estimatedAsIsValue)}`
      : `As-Is Value: ${money(estimatedAsIsValue)}`;

  const rangeLabel = isArv ? "Most Likely ARV" : "Most Likely As-Is Value Range";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">AI Quick Value Assessment</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={handleRun} disabled={pending}>
          {pending ? "Running…" : result ? "Re-run" : "Run"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          A rough directional gut-check against public listings (Zillow/Redfin) — not a substitute for a
          full comp analysis or underwriting.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result ? (
          <>
            <p className="text-sm">
              {borrowerLine}{" "}
              {result.low !== null || result.median !== null || result.high !== null
                ? `${rangeLabel}: Low ${money(result.low)}, Median ${money(result.median)}, High ${money(result.high)}.`
                : "No reliable range could be estimated."}
            </p>
            {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
            <p className="text-xs text-muted-foreground">Last run {new Date(result.ranAt).toLocaleString()}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not run yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
