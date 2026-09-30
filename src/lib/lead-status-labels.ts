import type { LeadStatus } from "@/lib/lead-scoring";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  engaged: "Engaged",
  hot: "Hot",
  contacted: "Contacted",
  nurture: "Nurture",
  converted: "Converted",
  dead: "Dead",
};

export const LEAD_STATUS_ORDER: LeadStatus[] = ["hot", "engaged", "new", "contacted", "nurture", "converted", "dead"];

// Tailwind classes, not inline styles — these are admin-app pages that
// already run on the shadcn/Tailwind token system, unlike the marketing
// site's hand-styled pages.
export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  engaged: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  hot: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  contacted: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  nurture: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  converted: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  dead: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};
