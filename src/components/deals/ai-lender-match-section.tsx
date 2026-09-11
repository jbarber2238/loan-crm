"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runLenderMatchAction } from "@/server/actions/ai-assessments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Fit = "strong" | "close" | "poor";

interface LenderMatch {
  dealFlags: string[];
  matches: { lenderName: string; productName: string; fit: Fit; reason: string }[];
  ranAt: string;
}

function fitVariant(fit: Fit): "default" | "secondary" | "destructive" {
  if (fit === "strong") return "default";
  if (fit === "close") return "secondary";
  return "destructive";
}

function fitLabel(fit: Fit): string {
  if (fit === "strong") return "Strong fit";
  if (fit === "close") return "Close";
  return "Not a fit";
}

export function AiLenderMatchSection({
  dealId,
  initialResult,
}: {
  dealId: string;
  initialResult: LenderMatch | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState(initialResult);

  function handleRun() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runLenderMatchAction(dealId);
        setResult(r);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't run the lender match.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">AI Quick Lender Match</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={handleRun} disabled={pending}>
          {pending ? "Running…" : result ? "Re-run" : "Run"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Checks this deal&apos;s numbers against your active lender products in this loan category.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result ? (
          <>
            {result.dealFlags.length > 0 && (
              <div className="space-y-1 rounded-md bg-muted/40 p-2">
                {result.dealFlags.map((flag, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    • {flag}
                  </p>
                ))}
              </div>
            )}
            {result.matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active products on file for this loan category.</p>
            ) : (
              <div className="space-y-2">
                {result.matches.map((m, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-md border p-2">
                    <div>
                      <p className="text-sm font-medium">
                        {m.lenderName} — {m.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.reason}</p>
                    </div>
                    <Badge variant={fitVariant(m.fit)} className="shrink-0">
                      {fitLabel(m.fit)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Last run {new Date(result.ranAt).toLocaleString()}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not run yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
