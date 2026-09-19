// Plain CSS bars, not SVG — consistent with the rest of the dashboard's
// "the number is the point" style. Every stage always renders, even at
// zero, so the shape of the chart doesn't jump around as counts change.
export function StageBarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex items-end gap-2 w-full" style={{ height: 200 }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center justify-end h-full min-w-0">
          <span className="text-sm font-semibold mb-1">{d.count}</span>
          <div
            className="w-full rounded-t bg-foreground/70"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 1 }}
          />
          <span className="mt-2 text-[11px] leading-tight text-center text-muted-foreground break-words">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}
