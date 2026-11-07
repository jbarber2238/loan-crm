import Link from "next/link";
import { closingWatchLabel, CLOSING_SOON_DAYS } from "@/lib/closing-watch";
import type { ClosingWatchRow } from "@/server/dashboard-metrics";
import { cn } from "@/lib/utils";

// "2026-11-04" -> "Nov 4, 2026". Built from the parts, not new Date(), so the day
// never shifts with the viewer's timezone.
function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const PILL = {
  overdue: { dark: "bg-[rgba(255,107,107,.16)] text-[#ff9b9b]", light: "bg-red-100 text-red-700" },
  soon: { dark: "bg-[rgba(250,95,5,.18)] text-[#fdb78f]", light: "bg-amber-100 text-amber-800" },
  no_date: { dark: "bg-[rgba(246,246,246,.1)] text-[rgba(246,246,246,.78)]", light: "bg-muted text-muted-foreground" },
} as const;

/**
 * The deals whose estimated closing date needs a look: already past, coming up
 * within a few days, or never set. Each row opens the deal so the date can be
 * updated on the spot.
 */
export function ClosingWatchList({ rows, tone }: { rows: ClosingWatchRow[]; tone: "dark" | "light" }) {
  const dark = tone === "dark";
  if (rows.length === 0) {
    return (
      <p className={cn("text-sm", dark ? "text-[rgba(246,246,246,.72)]" : "text-muted-foreground")}>
        Every open deal has an estimated closing date more than {CLOSING_SOON_DAYS} days out.
      </p>
    );
  }
  return (
    <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/deals/${r.id}`}
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
            dark ? "border-[rgba(246,246,246,.08)] bg-[#17191b] hover:border-[#fdb78f]/60" : "hover:bg-muted"
          )}
        >
          <div className="min-w-0">
            <div className="truncate font-medium">
              {r.loanNumber ? `#${r.loanNumber} · ` : ""}
              {r.propertyAddress}
            </div>
            <div className={cn("truncate text-xs", dark ? "text-[rgba(246,246,246,.66)]" : "text-muted-foreground")}>
              {r.estimatedClosingDay ? `Estimated Closing Date: ${shortDay(r.estimatedClosingDay)}` : "No estimated closing date set"}
            </div>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", PILL[r.status][tone])}>
            {closingWatchLabel(r.status, r.daysFromToday)}
          </span>
        </Link>
      ))}
    </div>
  );
}
