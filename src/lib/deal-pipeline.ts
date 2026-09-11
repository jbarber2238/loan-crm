// The 9 "real" pipeline stages a deal moves through in order — this is what
// the progress stepper renders. On Hold / Follow-up / Lost / Disqualified
// are excursions from this line, not steps on it.
export const PIPELINE_STAGES = [
  { value: "new", label: "New" },
  { value: "rate_shopping", label: "Rate Shopping" },
  { value: "term_sheet", label: "Term Sheet" },
  { value: "negotiation", label: "Negotiation" },
  { value: "application", label: "Application" },
  { value: "processing", label: "Processing" },
  { value: "conditional_approval", label: "Conditional Approval" },
  { value: "clear_to_close", label: "Clear to Close" },
  { value: "closed", label: "Closed" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["value"];

// Stages that pause the deal at whatever real stage it was last in — the
// stepper stays visible (dimmed) and a reason is required going in.
export const PAUSED_STAGES = new Set(["on_hold", "follow_up"]);

// Terminal, negative outcomes — the stepper disappears entirely in favor of
// a plain red badge, and the reason is kept forever in its own field for
// future reporting rather than folded into the general notes feed.
export const TERMINAL_NEGATIVE_STAGES = new Set(["lost", "disqualified"]);

// Every stage that requires a "why" before the transition is allowed to go
// through — used by both the header dropdown and the kanban board's
// drag-and-drop to decide when to interrupt with the reason dialog.
export const STAGES_REQUIRING_REASON = new Set([...PAUSED_STAGES, ...TERMINAL_NEGATIVE_STAGES]);

export function isPipelineStage(stage: string): stage is PipelineStage {
  return PIPELINE_STAGES.some((s) => s.value === stage);
}

// How many days a deal can sit in Follow-up with no further stage change
// before it's automatically moved to Lost.
export const FOLLOW_UP_AUTO_LOST_DAYS = 7;
