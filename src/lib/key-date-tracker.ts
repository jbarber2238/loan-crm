export type KeyDateItem = "appraisal" | "insurance" | "title";

export interface KeyDateItemConfig {
  key: KeyDateItem;
  label: string;
  // In order — the status dropdown only offers whichever of these come
  // after the current one, since these always move forward in practice.
  statuses: string[];
  // Only insurance/title have a third-party contact on file to email.
  emailable: boolean;
}

export const KEY_DATE_ITEMS: KeyDateItemConfig[] = [
  {
    key: "appraisal",
    label: "Appraisal",
    statuses: ["Ordered", "Paid", "Scheduled", "Inspected", "Complete"],
    emailable: false,
  },
  {
    key: "insurance",
    label: "Property Insurance (HOI)",
    statuses: ["Ordered", "Partially Received", "Received"],
    emailable: true,
  },
  {
    key: "title",
    label: "Title",
    statuses: ["Ordered", "Partially Received", "Received"],
    emailable: true,
  },
];

export function keyDateItemConfig(item: KeyDateItem): KeyDateItemConfig {
  const config = KEY_DATE_ITEMS.find((i) => i.key === item);
  if (!config) throw new Error(`Unknown key date item: ${item}`);
  return config;
}

export interface KeyDateEvent {
  id: string;
  item: KeyDateItem;
  status: string;
  eventDate: Date;
  createdAt: Date;
  createdByName: string | null;
}

/**
 * The item's current status is whichever logged status sits furthest along
 * the pipeline — not whichever has the latest eventDate. Statuses logged on
 * the same day (the common case: someone clicks through several stages in
 * one sitting) have no reliable date ordering to break the tie with, and
 * backdating one stage earlier than another shouldn't make the pipeline
 * appear to move backward. Pipeline position is the only signal that's
 * always unambiguous.
 */
export function currentEventFor(item: KeyDateItem, events: KeyDateEvent[]): KeyDateEvent | null {
  const { statuses } = keyDateItemConfig(item);
  let best: KeyDateEvent | null = null;
  let bestIndex = -1;
  for (const e of events) {
    const index = statuses.indexOf(e.status);
    if (index === -1) continue;
    if (index > bestIndex || (index === bestIndex && best !== null && e.eventDate > best.eventDate)) {
      best = e;
      bestIndex = index;
    }
  }
  return best;
}
