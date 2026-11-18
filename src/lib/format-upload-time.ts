// Exact moment a file arrived, e.g. "Nov 17, 2026, 3:42 PM EST". Always Eastern so the server render and every
// browser agree (no hydration mismatch) and two people on a deal read the same time.
const FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatUploadedAt(value: Date | string): string {
  return FORMAT.format(new Date(value));
}
