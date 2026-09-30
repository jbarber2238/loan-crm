"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LeadGateForm } from "@/components/marketing/lead-gate-form";
import { MaxOfferCalculator } from "@/components/marketing/max-offer-calculator";
import { verifyLeadId } from "@/server/actions/leads";

const LEAD_SOURCE = "max_allowable_offer_calculator";
const STORAGE_KEY = `manna-lead-id:${LEAD_SOURCE}`;

const GREEN = "#3F8F5C";

const BULLETS = ["Live, instant results", "A pre-filled Excel version", "Built-in ARV stress test"];

function BulletRow() {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {BULLETS.map((label) => (
        <div key={label} className="flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={GREEN}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span className="text-sm font-medium text-[#1E1E1E]">{label}</span>
        </div>
      ))}
    </div>
  );
}

// Percent-of-frame positions, carried over from a design mockup tuned at a
// 1199×660 reference frame — kept as a fraction of that frame (via an
// aspect-ratio container) so the fan scales together at any width instead
// of the pieces drifting apart.
const FANNED_SHOTS = [
  { src: "/marketing/moac-preview-step1.png", alt: "Step 1: setting your max allowable offer", left: 1.08, top: 2.42, width: 38.95, aspect: "467/277", rotate: -7, shadow: "0 18px 30px rgba(20,20,20,0.16)", z: 1 },
  { src: "/marketing/moac-preview-step2.png", alt: "Step 2: purchase price and leverage", left: 4.92, top: 11.52, width: 38.45, aspect: "461/276", rotate: -2, shadow: "0 22px 38px rgba(20,20,20,0.18)", z: 2 },
  { src: "/marketing/moac-preview-step6.png", alt: "Step 6: projected profit and margin", left: 9.26, top: 20.3, width: 38.95, aspect: "467/302", rotate: 2.5, shadow: "0 30px 50px rgba(20,20,20,0.22)", z: 3 },
];

function FannedPreview({ leadGateForm }: { leadGateForm: React.ReactNode }) {
  return (
    <>
      {/* Desktop: the fanned screenshots with the form floated over the corner. */}
      <div className="relative hidden md:block" style={{ aspectRatio: "1199 / 660" }}>
        {FANNED_SHOTS.map((shot) => (
          <div
            key={shot.src}
            className="absolute overflow-hidden rounded-[10px]"
            style={{
              left: `${shot.left}%`,
              top: `${shot.top}%`,
              width: `${shot.width}%`,
              aspectRatio: shot.aspect,
              transform: `rotate(${shot.rotate}deg)`,
              boxShadow: shot.shadow,
              zIndex: shot.z,
            }}
          >
            <Image src={shot.src} alt={shot.alt} fill className="object-cover" sizes="40vw" />
          </div>
        ))}
        <div className="absolute z-[4]" style={{ right: "10.43%", bottom: "23.48%", width: "25.02%" }}>
          {leadGateForm}
        </div>
      </div>

      {/* Mobile: a single lead screenshot, then the form in normal flow. */}
      <div className="md:hidden">
        <div className="overflow-hidden rounded-[10px] shadow-[0_18px_30px_rgba(20,20,20,0.16)]">
          <Image
            src="/marketing/moac-preview-step6.png"
            alt="A real result from the calculator: projected profit and margin"
            width={1902}
            height={1150}
            className="w-full"
          />
        </div>
        <div className="mt-6">{leadGateForm}</div>
      </div>
    </>
  );
}

export function MaxOfferCalculatorGate({ leadIdFromUrl }: { leadIdFromUrl?: string }) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    // Deferred a tick so the state update happens inside a callback rather
    // than synchronously in the effect body — avoids a hydration mismatch
    // (the server always renders the gate first) while still resolving
    // before the next paint.
    Promise.resolve().then(async () => {
      // The emailed "here's your calculator" link carries the lead's own id
      // so a returning visitor (any device, not just the one that submitted
      // the form) skips straight past the gate — verified server-side so a
      // hand-typed/garbage id can't be used to bypass the consent gate.
      if (leadIdFromUrl) {
        const valid = await verifyLeadId(leadIdFromUrl).catch(() => false);
        if (valid) {
          setLeadId(leadIdFromUrl);
          try {
            localStorage.setItem(STORAGE_KEY, leadIdFromUrl);
          } catch {
            // Non-fatal — the calculator still works for this visit either way.
          }
          setCheckedStorage(true);
          return;
        }
      }

      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // Private browsing / blocked storage — just show the gate again.
      }
      setLeadId(stored);
      setCheckedStorage(true);
    });
  }, [leadIdFromUrl]);

  function handleUnlock(id: string) {
    setLeadId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Non-fatal — the calculator still works for this visit either way.
    }
  }

  if (leadId) {
    // The calculator's own sections were tuned for a narrower column than
    // the wider gate layout above needs, so it keeps its original width
    // even though the page around it got wider for the fanned preview.
    return (
      <div className="mx-auto max-w-4xl">
        <MaxOfferCalculator leadId={leadId} />
      </div>
    );
  }

  // Wait for the localStorage check before deciding to show the gate, so a
  // returning visitor doesn't see a flash of the form before skipping it.
  if (!checkedStorage) return null;

  return (
    <div className="flex flex-col gap-8">
      <BulletRow />
      <FannedPreview
        leadGateForm={<LeadGateForm source={LEAD_SOURCE} buttonLabel="Show Me My Numbers" onUnlock={handleUnlock} />}
      />
    </div>
  );
}
