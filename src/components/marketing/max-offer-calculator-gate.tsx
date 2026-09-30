"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { LeadGateForm } from "@/components/marketing/lead-gate-form";
import { MaxOfferCalculator } from "@/components/marketing/max-offer-calculator";

const LEAD_SOURCE = "max_allowable_offer_calculator";
const STORAGE_KEY = `manna-lead-id:${LEAD_SOURCE}`;

const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const GREEN = "#3F8F5C";

const WHAT_YOU_GET = [
  "A live calculator — sliders for every assumption, results that update instantly",
  "A pre-filled Excel version — every number is a real formula, not a snapshot",
  "A built-in ARV stress test — see your margin hold up if the sale price comes in lower",
];

function ResultsPreview() {
  return (
    <div className="rounded-sm border bg-white p-5" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <p className="text-[10px] font-medium tracking-[0.15em]" style={{ color: MOSS }}>
        EXAMPLE — YOUR OWN NUMBERS UNLOCK BELOW
      </p>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-sm font-medium" style={{ color: BASALT }}>
          Projected Profit
        </span>
        <span className="text-xl font-semibold" style={{ color: GREEN }}>
          $65,880
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm font-medium" style={{ color: BASALT }}>
          Profit Margin
        </span>
        <span className="text-sm font-semibold" style={{ color: GREEN }}>
          16.5% — On target
        </span>
      </div>
      <ul className="mt-5 space-y-2">
        {WHAT_YOU_GET.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: BASALT }}>
            <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: TEAL }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MaxOfferCalculatorGate() {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    // Deferred a tick so the state update happens inside a callback rather
    // than synchronously in the effect body — avoids a hydration mismatch
    // (the server always renders the gate first) while still resolving
    // before the next paint.
    Promise.resolve().then(() => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // Private browsing / blocked storage — just show the gate again.
      }
      setLeadId(stored);
      setCheckedStorage(true);
    });
  }, []);

  function handleUnlock(id: string) {
    setLeadId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Non-fatal — the calculator still works for this visit either way.
    }
  }

  if (leadId) {
    return <MaxOfferCalculator leadId={leadId} />;
  }

  // Wait for the localStorage check before deciding to show the gate, so a
  // returning visitor doesn't see a flash of the form before skipping it.
  if (!checkedStorage) return null;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <ResultsPreview />
      <LeadGateForm source={LEAD_SOURCE} buttonLabel="Show Me My Numbers" onUnlock={handleUnlock} />
    </div>
  );
}
