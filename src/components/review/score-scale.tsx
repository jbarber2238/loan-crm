"use client";

// 0 to 10 in one tap. Big enough for a thumb, two rows on a phone.
export function ScaleQuestion({
  label,
  prompt,
  value,
  onChange,
  low = "Not at all",
  high = "Absolutely",
}: {
  label: string;
  prompt: string;
  value: number | null;
  onChange: (value: number) => void;
  low?: string;
  high?: string;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="space-y-0.5">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-sm text-muted-foreground">{prompt}</span>
      </legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className={`h-11 rounded-md border text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                selected ? "bp-selected border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>0 · {low}</span>
        <span>10 · {high}</span>
      </div>
    </fieldset>
  );
}
