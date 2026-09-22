/** Radix Select can't use an empty string as an item value, so TimeSelect's "no restriction" option submits this instead — translated back to null wherever it's read server-side. Kept in a plain .ts file (not time-select.tsx) so server actions can import just the constant without pulling in client component code. */
export const TIME_SELECT_BLANK = "none";
