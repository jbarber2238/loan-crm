import { PARTNER_STAGE_LABELS, PARTNER_STAGE_STEPS, PAUSED_MICROCOPY, type PartnerStage } from "@/lib/partner-comp";

const TEAL = "#143D4A";
const MOSS = "#68735F";

/** The six-step happy path. Paused and "didn't proceed" show a plain note instead of a position. */
export function StageStepper({ stage, paid }: { stage: PartnerStage; paid: boolean }) {
  if (stage === "paused") {
    return (
      <div className="rounded-sm border bg-white p-3 text-sm">
        <p className="font-medium">{PARTNER_STAGE_LABELS.paused}</p>
        <p className="mt-0.5 text-xs" style={{ color: MOSS }}>
          {PAUSED_MICROCOPY}
        </p>
      </div>
    );
  }
  if (stage === "didnt_proceed") {
    return (
      <div className="rounded-sm border bg-white p-3 text-sm">
        <p className="font-medium">{PARTNER_STAGE_LABELS.didnt_proceed}</p>
        <p className="mt-0.5 text-xs" style={{ color: MOSS }}>
          Thanks for sending it our way.
        </p>
      </div>
    );
  }

  const current = PARTNER_STAGE_STEPS.indexOf(stage);
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label={`Stage: ${PARTNER_STAGE_LABELS[stage]}${paid ? ", paid" : ""}`}>
      {PARTNER_STAGE_STEPS.map((step, i) => {
        const done = i < current || (i === current && stage === "closed");
        const here = i === current;
        return (
          <li key={step} className="min-w-0">
            <div className="h-1.5 rounded-full" style={{ backgroundColor: done || here ? TEAL : "rgba(20,61,74,0.15)", opacity: here && !done ? 0.55 : 1 }} />
            <p className={`mt-1.5 text-[10px] leading-tight ${here ? "font-semibold" : ""}`} style={{ color: here ? TEAL : MOSS }}>
              {PARTNER_STAGE_LABELS[step]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
