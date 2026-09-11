import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, PAUSED_STAGES, TERMINAL_NEGATIVE_STAGES } from "@/lib/deal-pipeline";
import { labelFor, STAGES } from "@/lib/labels";

// How far the chevron tip/notch cuts into each segment, in px — kept small
// since there are 9 segments packed into one compact bar.
const CHEVRON_DEPTH = 5;

function chevronClipPath(index: number, total: number): string | undefined {
  const h = `${CHEVRON_DEPTH}px`;
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
}: {
  stage: string;
  pausedFromStage: string | null;
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
  const cols = `repeat(${total}, 1fr)`;

  return (
    <div className="flex items-start gap-2">
      <div className="max-w-xl flex-1">
        <div
          role="img"
          aria-label={`Pipeline progress: currently at ${labelFor(STAGES, anchorStage)}`}
          className={`grid h-2.5 overflow-hidden rounded-full ${isPaused ? "opacity-50 grayscale" : ""}`}
          style={{ gridTemplateColumns: cols }}
        >
          {PIPELINE_STAGES.map((s, i) => (
            <div
              key={s.value}
              className={i <= currentIndex ? "bg-green-600" : "bg-muted"}
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
                i <= currentIndex ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
      {isPaused && (
        <Badge variant="secondary" className="mt-0.5 shrink-0 text-[10px]">
          {labelFor(STAGES, stage)}
        </Badge>
      )}
    </div>
  );
}
