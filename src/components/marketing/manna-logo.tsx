// Real exported brand artwork (2026-09-15 brand package), not a
// recreation — swap files in /public/brand if the brand kit is ever
// re-exported. "primary" (deep teal) is for light/neutral backgrounds;
// "reversed" (off-white) is for Deep Teal or Basalt backgrounds, per the
// brand guide's usage notes.
const LOCKUP_SRC = {
  primary: "/brand/manna-lending-lockup-transparent.png",
  reversed: "/brand/manna-lending-onecolor-white-transparent.png",
};

const ICON_SRC = {
  primary: "/brand/manna-lending-icon-teal-transparent.png",
  reversed: "/brand/manna-lending-icon-sand-transparent.png",
};

export function MannaLogo({
  variant = "primary",
  className,
}: {
  variant?: "primary" | "reversed";
  className?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOCKUP_SRC[variant]} alt="Manna Lending" className={className} />;
}

export function MannaIcon({ variant = "primary", className }: { variant?: "primary" | "reversed"; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ICON_SRC[variant]} alt="Manna Lending" className={className} />;
}
