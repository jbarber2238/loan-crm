"use client";

import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DASHBOARD_SECTIONS, libraryMetricsFor } from "@/lib/dashboard-metric-library";
import { MetricToggle } from "@/components/dashboard/metric-toggle";

export function MetricsLibrarySheet({ enabledMetrics }: { enabledMetrics: string[] }) {
  const enabled = new Set(enabledMetrics);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Metrics Library">
          <SettingsIcon className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Metrics Library</SheetTitle>
          <SheetDescription>
            Metrics that exist but aren&apos;t shown on the dashboard by default, plus metrics not yet buildable —
            each needs a data source this app doesn&apos;t collect yet.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {DASHBOARD_SECTIONS.map(({ value, label }) => {
            const metrics = libraryMetricsFor(value);
            if (metrics.length === 0) return null;
            return (
              <div key={value} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                {metrics.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.description}
                        {!m.computable && m.needs && <span className="italic"> Needs: {m.needs}.</span>}
                      </p>
                    </div>
                    {m.computable ? (
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        <span className="text-xs text-muted-foreground">Show</span>
                        <MetricToggle metricId={m.id} enabled={enabled.has(m.id)} />
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
