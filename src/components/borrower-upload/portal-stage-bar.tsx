import { PIPELINE_STAGES } from "@/lib/deal-pipeline";
import { chevronClipPath } from "@/components/deals/pipeline-stepper";
import { labelFor, STAGES } from "@/lib/labels";

const DEPTH = 12;

/**
 * The borrower portal's stage bar when the company has set its colors: ten arrow segments with
 * the stage names inside. Reached stages take the company's button color, the current one its
 * lighter tint, and stages ahead a muted shade of the header color. Read from CSS variables set
 * by the page (--bp-*), so the bar can't drift from the rest of the portal.
 */
export function PortalStageBar({ stage }: { stage: string }) {
  const total = PIPELINE_STAGES.length;
  const current = Math.max(
    0,
    PIPELINE_STAGES.findIndex((s) => s.value === stage)
  );
  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={`Loan progress: currently at ${labelFor(STAGES, stage)}`}
        className="grid min-w-[40rem]"
        style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
      >
        {PIPELINE_STAGES.map((s, i) => {
          const state = i < current ? "reached" : i === current ? "current" : "upcoming";
          return (
            <div
              key={s.value}
              data-state={state}
              className={`bp-stage flex h-[38px] items-center justify-center px-4 text-center text-[11px] leading-[1.1] font-semibold ${
                i === 0 ? "rounded-l-full" : ""
              }`}
              style={{ clipPath: chevronClipPath(i, total, DEPTH), marginLeft: i === 0 ? 0 : -(DEPTH - 3) }}
            >
              {s.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
