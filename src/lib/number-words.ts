const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/** 0–20 spelled out ("two"); anything bigger stays as digits. */
export function numberToWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

/**
 * The opening of the "your term sheets are ready" email, based on how many
 * term sheets are actually being offered: "Your term sheets are ready. I have
 * two options for you." — or the singular form for exactly one.
 */
export function termSheetReadyLine(count: number): string {
  if (count === 1) return "Your term sheet is ready. I have one option for you.";
  if (count < 1) return "Your term sheets are ready.";
  return `Your term sheets are ready. I have ${numberToWord(count)} options for you.`;
}
