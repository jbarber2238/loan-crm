import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, PAUSED_STAGES, TERMINAL_NEGATIVE_STAGES } from "@/lib/deal-pipeline";
import { labelFor, STAGES } from "@/lib/labels";

// How far the chevron tip/notch cuts into each segment, in px — kept small
// since there are 9 segments packed into one compact bar.
const CHEVRON_DEPTH = 5;

function chevronClipPath(index: number, total: number, depth = CHEVRON_DEPTH): string | undefined {
  const h = `${depth}px`;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  if (isFirst && isLast) return undefined;
  if (isFirst) return `polygon(0% 0%, calc(100% - ${h}) 0%, 100% 50%, calc(100% - ${h}) 100%, 0% 100%)`;
  if (isLast) return `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, ${h} 50%)`;
  return `polygon(0% 0%, calc(100% - ${h}) 0%, 100% 50%, calc(100% - ${h}) 100%, 0% 100%, ${h} 50%)`;
}

// A compact chevron-segmented bar with each stage's name underneath — one
// segment per real pipeline stage, filled green up through the current one.
// Capped at a modest max width so it reads as one self-contained widget in
// the header rather than a hairline stretched edge-to-edge. Lost/
// Disqualified drop it for a plain red badge; On Hold/Follow-up dim it and
// anchor the fill to whatever real stage the deal paused at.
export function PipelineStepper({
  stage,
  pausedFromStage,
  onDark = false,
}: {
  stage: string;
  pausedFromStage: string | null;
  /** Light-on-dark palette, for placing the bar on a dark banner. */
  onDark?: boolean;
}) {
  if (TERMINAL_NEGATIVE_STAGES.has(stage)) {
    return (
      <Badge variant="destructive" className="text-xs">
        {labelFor(STAGES, stage)}
      </Badge>
    );
  }

  const isPaused = PAUSED_STAGES.has(stage);
  const anchorStage = isPaused ? (pausedFromStage ?? "new") : stage;
  const currentIndex = Math.max(
    0,
    PIPELINE_STAGES.findIndex((s) => s.value === anchorStage)
  );
  const total = PIPELINE_STAGES.length;
  const doneBar = onDark ? "bg-green-500" : "bg-green-600";
  const todoBar = onDark ? "bg-white/25" : "bg-muted";
  const doneLabel = onDark ? "font-medium text-primary-foreground" : "font-medium text-foreground";
  const todoLabel = onDark ? "text-primary-foreground/60" : "text-muted-foreground";
  const cols = `repeat(${total}, 1fr)`;

  // The dark appearance draws the stage bar its own way (taller arrow segments with the
  // names inside). Both are in the page; CSS shows whichever matches the user's theme, so
  // the light look is untouched.
  const DARK_DEPTH = 14;
  const darkBar = onDark ? null : (
    <div className="theme-dark-only flex items-start gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div
          role="img"
          aria-label={`Pipeline progress: currently at ${labelFor(STAGES, anchorStage)}`}
          className={`grid min-w-[44rem] ${isPaused ? "opacity-50 grayscale" : ""}`}
          style={{ gridTemplateColumns: cols }}
        >
          {PIPELINE_STAGES.map((s, i) => {
            const tone =
              i < currentIndex
                ? "bg-[#fa5f05] text-[#0b0c0d]"
                : i === currentIndex
                  ? "bg-[#fdb78f] text-[#0b0c0d]"
                  : "bg-[#333f48] text-white";
            return (
              <div
                key={s.value}
                className={`flex h-[38px] items-center justify-center px-5 text-center text-[11px] leading-[1.1] font-semibold ${tone} ${i === 0 ? "rounded-l-full" : ""}`}
                style={{
                  clipPath: chevronClipPath(i, total, DARK_DEPTH),
                  marginLeft: i === 0 ? 0 : -(DARK_DEPTH - 3),
                }}
              >
                {s.label}
              </div>
            );
          })}
        </div>
      </div>
      {isPaused && (
        <Badge variant="secondary" className="mt-2 shrink-0 text-[10px]">
          {labelFor(STAGES, stage)}
        </Badge>
      )}
    </div>
  );

  return (
    <>
    {darkBar}
    <div className={`flex items-start gap-2 ${onDark ? "" : "theme-light-only"}`}>
      <div className="max-w-xl min-w-0 flex-1 overflow-x-auto">
        <div className="min-w-[30rem]">
        <div
          role="img"
          aria-label={`Pipeline progress: currently at ${labelFor(STAGES, anchorStage)}`}
          className={`grid h-2.5 overflow-hidden rounded-full ${isPaused ? "opacity-50 grayscale" : ""}`}
          style={{ gridTemplateColumns: cols }}
        >
          {PIPELINE_STAGES.map((s, i) => (
            <div
              key={s.value}
              className={i <= currentIndex ? doneBar : todoBar}
              style={{
                clipPath: chevronClipPath(i, total),
                marginLeft: i === 0 ? 0 : -CHEVRON_DEPTH,
              }}
            />
          ))}
        </div>
        <div className="mt-1 grid" style={{ gridTemplateColumns: cols }}>
          {PIPELINE_STAGES.map((s, i) => (
            <span
              key={s.value}
              className={`px-0.5 text-center text-[9px] leading-tight ${
                i <= currentIndex ? doneLabel : todoLabel
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
        </div>
      </div>
      {isPaused && (
        <Badge variant="secondary" className="mt-0.5 shrink-0 text-[10px]">
          {labelFor(STAGES, stage)}
        </Badge>
      )}
    </div>
    </>
  );
}
