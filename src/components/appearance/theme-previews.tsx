// Little drawings of the pipeline in each look, for the welcome dialog and the Appearance card.
// Colors are fixed on purpose: each preview shows its own theme whichever one is active.

const DARK_CARD = "rounded-[3px] border border-[#2b2c2e] bg-[#121315] p-[3px]";

export function DarkPreview({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex overflow-hidden rounded-xl bg-[#0b0c0d] ${className}`}>
      <div className="flex w-[18%] shrink-0 flex-col gap-1.5 bg-[#08090a] p-2">
        <div className="h-4 rounded-[3px] border border-dashed border-[#605d5b]" />
        <div className="h-2.5 rounded-full bg-[#fa5f05]" />
        <div className="h-2.5 rounded-full bg-[#1c1d1f]" />
        <div className="h-2.5 rounded-full bg-[#1c1d1f]" />
        <div className="h-2.5 rounded-full bg-[#1c1d1f]" />
      </div>
      <div className="min-w-0 flex-1 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold text-white">Pipeline</span>
          <span className="rounded-full bg-[#fa5f05] px-1.5 py-px text-[6px] font-bold text-[#0b0c0d]">+ New Deal</span>
        </div>
        <div className="mb-1.5 rounded-md bg-gradient-to-r from-[#1a0d05] via-[#8a3a05] to-[#fdb78f] px-2 py-1.5">
          <p className="text-[5px] font-semibold tracking-wider text-white/80">OPEN PIPELINE VALUE</p>
          <p className="text-[11px] font-bold text-white">$22,986</p>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {["New", "Term Sheet", "Negotiation", "App Review"].map((name, i) => (
            <div key={name} className="space-y-1 rounded-[4px] border border-[#2b2c2e] bg-[#17181a] p-1">
              <p className="truncate text-[5px] font-bold text-white">{name}</p>
              {i > 0 && (
                <div className={DARK_CARD}>
                  <div className="mb-0.5 h-0.5 w-3/4 rounded bg-white" />
                  <div className="flex gap-0.5">
                    <div className="h-1 w-3 rounded-full bg-[#2a1a10]" />
                    <div className="h-1 w-3 rounded-full bg-[#333f48]" />
                  </div>
                </div>
              )}
              {i === 2 && (
                <div className={DARK_CARD}>
                  <div className="mb-0.5 h-0.5 w-2/3 rounded bg-white" />
                  <div className="flex gap-0.5">
                    <div className="h-1 w-3 rounded-full bg-[#2a1a10]" />
                    <div className="h-1 w-3 rounded-full bg-[#333f48]" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LightPreview({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex overflow-hidden rounded-xl border border-[#e5e5e5] bg-white ${className}`}>
      <div className="flex w-[18%] shrink-0 flex-col gap-1.5 bg-[#111318] p-2">
        <div className="h-2.5 rounded-[3px] bg-[#2a2d36]" />
        <div className="h-2.5 rounded-[3px] bg-[#2a2d36]" />
        <div className="h-2.5 rounded-[3px] bg-[#2a2d36]" />
      </div>
      <div className="min-w-0 flex-1 p-2.5">
        <div className="mb-1.5 h-5 rounded-md bg-[#18181b]" />
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] rounded-[4px] border border-[#e5e5e5] bg-[#f4f4f5]" />
          ))}
        </div>
      </div>
    </div>
  );
}
