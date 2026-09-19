"use client";

import { useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { setDashboardMetricEnabled } from "@/server/actions/dashboard-settings";

export function MetricToggle({ metricId, enabled }: { metricId: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Checkbox
      checked={enabled}
      disabled={isPending}
      onCheckedChange={(checked) => {
        startTransition(() => {
          void setDashboardMetricEnabled(metricId, checked === true);
        });
      }}
    />
  );
}
