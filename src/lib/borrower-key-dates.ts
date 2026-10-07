import { KEY_DATE_ITEMS, currentEventFor, type KeyDateEvent } from "@/lib/key-date-tracker";

export interface BorrowerKeyDate {
  label: string;
  // The latest phase reached and when it happened; null until something is
  // logged, which the borrower sees as "Not ordered".
  status: string | null;
  date: Date | null;
}

// What the borrower page calls each tracked item — plainer than the staff
// labels ("Property Insurance (HOI)").
const BORROWER_LABELS: Record<string, string> = {
  appraisal: "Appraisal",
  insurance: "Property insurance",
  title: "Title",
};

/**
 * The compact key-dates strip on the borrower upload page: each tracked item's
 * latest phase and the date it happened, then the credit pull. Same source as
 * the staff Key Dates tab (latest phase = furthest along, via currentEventFor).
 */
export function buildBorrowerKeyDates(events: KeyDateEvent[], creditPullDate: Date | null): BorrowerKeyDate[] {
  const items: BorrowerKeyDate[] = KEY_DATE_ITEMS.map((item) => {
    // currentEventFor ranks by status name only, so hand it just this item's events.
    const current = currentEventFor(item.key, events.filter((e) => e.item === item.key));
    return {
      label: BORROWER_LABELS[item.key] ?? item.label,
      status: current?.status ?? null,
      date: current?.eventDate ?? null,
    };
  });
  items.push({
    label: "Credit pull",
    status: creditPullDate ? "Pulled" : null,
    date: creditPullDate,
  });
  return items;
}
