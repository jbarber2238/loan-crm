"use client";

import { useEffect, useState } from "react";
import { MaxOfferCalculator } from "@/components/marketing/max-offer-calculator";
import { verifyLeadId } from "@/server/actions/leads";

const LEAD_SOURCE = "max_allowable_offer_calculator";
const STORAGE_KEY = `manna-lead-id:${LEAD_SOURCE}`;

/**
 * The calculator itself is free to use — no gate. This wrapper only
 * resolves whether we already know who this visitor is (from the emailed
 * "here's your calculator" link's `?lead=` param, or a prior Excel-download
 * gate submission saved to localStorage), so a returning visitor's next
 * Excel download skips straight past the gate form instead of asking again.
 */
export function MaxOfferCalculatorGate({ leadIdFromUrl }: { leadIdFromUrl?: string }) {
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(async () => {
      // Verified server-side so a hand-typed/garbage id can't impersonate a
      // real lead when the Excel-download gate goes to skip itself.
      if (leadIdFromUrl) {
        const valid = await verifyLeadId(leadIdFromUrl).catch(() => false);
        if (valid) {
          setLeadId(leadIdFromUrl);
          try {
            localStorage.setItem(STORAGE_KEY, leadIdFromUrl);
          } catch {
            // Non-fatal — the gate just asks again this visit.
          }
          return;
        }
      }

      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // Private browsing / blocked storage — the gate just asks again.
      }

      if (stored) {
        const valid = await verifyLeadId(stored).catch(() => false);
        if (!valid) {
          stored = null;
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Non-fatal — worst case it re-checks and clears again next visit.
          }
        }
      }

      setLeadId(stored);
    });
  }, [leadIdFromUrl]);

  return <MaxOfferCalculator initialLeadId={leadId} />;
}
