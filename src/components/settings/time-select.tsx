import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_SELECT_BLANK } from "@/lib/time-select";

export { TIME_SELECT_BLANK };

function formatLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Half-hour increments only — nobody needs the difference between 8:05 and
// 8:00, and a short, tap-friendly list is a much easier target than
// fighting a native time-spinner widget (which, as it turns out, doesn't
// reliably honor min/max in every browser anyway).
function halfHourOptions(min: string, max: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let totalMinutes = 0; totalMinutes < 24 * 60; totalMinutes += 30) {
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    const value = `${hh}:${mm}`;
    if (value < min || value > max) continue;
    options.push({ value, label: formatLabel(value) });
  }
  return options;
}

/** A plain, tap-friendly half-hour dropdown for a time-of-day field — `min`/`max` genuinely limit which options exist, not just a browser attribute a picker may or may not honor. */
export function TimeSelect({
  name,
  ariaLabel,
  defaultValue,
  min = "00:00",
  max = "23:30",
  allowBlank,
  blankLabel = "No restriction",
  placeholder = "Select a time",
}: {
  name: string;
  ariaLabel?: string;
  defaultValue: string | null;
  min?: string;
  max?: string;
  allowBlank?: boolean;
  blankLabel?: string;
  placeholder?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue ?? (allowBlank ? TIME_SELECT_BLANK : undefined)}>
      <SelectTrigger className="w-full" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowBlank && <SelectItem value={TIME_SELECT_BLANK}>{blankLabel}</SelectItem>}
        {halfHourOptions(min, max).map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
