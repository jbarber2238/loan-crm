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

/**
 * Phone version of the stage bar: the current stage's name, "Step n of 10", and ten thin
 * segments, so nothing has to scroll sideways on a narrow screen. Branded colors come from the
 * same --bp-* variables; the standard look uses the green-on-dark of the regular stepper.
 */
export function PortalStageCompact({ stage, branded }: { stage: string; branded: boolean }) {
  const total = PIPELINE_STAGES.length;
  const current = Math.max(
    0,
    PIPELINE_STAGES.findIndex((s) => s.value === stage)
  );
  return (
    <div
      role="img"
      aria-label={`Loan progress: step ${current + 1} of ${total}, ${labelFor(STAGES, stage)}`}
      className="space-y-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-base font-semibold">{PIPELINE_STAGES[current].label}</p>
        <p className={`shrink-0 text-xs tabular-nums ${branded ? "bp-muted" : "text-primary-foreground/70"}`}>
          Step {current + 1} of {total}
        </p>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {PIPELINE_STAGES.map((s, i) => (
          <span
            key={s.value}
            data-state={i < current ? "reached" : i === current ? "current" : "upcoming"}
            className={`bp-stage-dot h-1.5 min-w-0 flex-1 rounded-full ${
              branded ? "" : i <= current ? "bg-green-500" : "bg-white/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
