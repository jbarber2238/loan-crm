"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { DASHBOARD_METRIC_LIBRARY } from "@/lib/dashboard-metric-library";

export async function setDashboardMetricEnabled(metricId: string, enabled: boolean) {
  await requireAdmin();
  const def = DASHBOARD_METRIC_LIBRARY.find((m) => m.id === metricId);
  if (!def || !def.computable) return;

  const row = await db.query.companySettings.findFirst({ where: eq(companySettings.id, "default") });
  const current = row?.enabledDashboardMetrics ?? [];
  const next = enabled ? [...new Set([...current, metricId])] : current.filter((id) => id !== metricId);

  await db
    .insert(companySettings)
    .values({ id: "default", name: "", enabledDashboardMetrics: next })
    .onConflictDoUpdate({ target: companySettings.id, set: { enabledDashboardMetrics: next, updatedAt: new Date() } });

  revalidatePath("/dashboard");
}
