"use client";

import { useState } from "react";
import { LeadGateForm } from "@/components/marketing/lead-gate-form";
import { MaxOfferCalculator } from "@/components/marketing/max-offer-calculator";

const LEAD_SOURCE = "max_allowable_offer_calculator";

export function MaxOfferCalculatorGate() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <LeadGateForm source={LEAD_SOURCE} onUnlock={() => setUnlocked(true)} />;
  }

  return <MaxOfferCalculator />;
}
