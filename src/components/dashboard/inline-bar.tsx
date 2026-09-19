// A plain, precise "table with a bar" — the number is the point, the bar is
// just a quick visual read alongside it, not a substitute for it.
export function InlineBar({ percent, className = "" }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${clamped}%` }} />
    </div>
  );
}
