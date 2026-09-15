// Recreated from Manna Lending's brand guide (2026-09) as real vector markup
// rather than a rasterized export, so it stays crisp at any size and can
// take the brand's two approved color treatments directly:
// - "primary": deep teal mark, for light/neutral (Sand Dune, off-white) backgrounds.
// - "reversed": one-color off-white mark, for Deep Teal or Basalt Black backgrounds.
// Per the guide's usage notes, the icon and wordmark are never separated in
// this lockup, and the mark is deliberately quiet — no drop shadows, no
// second color mixed in beyond the one active tone.

const TEAL = "#143D4A";
const OFF_WHITE = "#FAF7F2";

export function MannaLogo({
  variant = "primary",
  className,
}: {
  variant?: "primary" | "reversed";
  className?: string;
}) {
  const color = variant === "primary" ? TEAL : OFF_WHITE;
  return (
    <svg
      viewBox="0 0 300 72"
      className={className}
      role="img"
      aria-label="Manna Lending"
    >
      <rect x="1.25" y="1.25" width="61.5" height="61.5" fill="none" stroke={color} strokeWidth="2.5" />
      <text
        x="34"
        y="40"
        fontFamily="var(--font-archivo), Archivo, sans-serif"
        fontWeight="400"
        fontSize="30"
        letterSpacing="1"
        fill={color}
      >
        MANNA
      </text>
      <text
        x="90"
        y="58"
        fontFamily="var(--font-archivo), Archivo, sans-serif"
        fontWeight="500"
        fontSize="14"
        letterSpacing="4"
        fill={color}
      >
        LENDING
      </text>
    </svg>
  );
}

export function MannaIcon({ variant = "primary", className }: { variant?: "primary" | "reversed"; className?: string }) {
  const color = variant === "primary" ? TEAL : OFF_WHITE;
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Manna Lending">
      <rect x="2" y="2" width="36" height="36" fill="none" stroke={color} strokeWidth="3" />
    </svg>
  );
}
