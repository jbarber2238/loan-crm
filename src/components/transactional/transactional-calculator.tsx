"use client";

import { useState } from "react";
import { CostSummary } from "@/components/transactional/cost-summary";

const TEAL = "#143D4A";

/** The "know the number before you request" box on the transactional funding page. */
export function TransactionalCalculator() {
  const [raw, setRaw] = useState("");
  const [sameDay, setSameDay] = useState(false);
  const amount = Number(raw.replace(/[$,\s]/g, ""));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="calc-amount" className="text-[10px] font-medium tracking-[0.14em] uppercase" style={{ color: "#68735F" }}>
          Funding amount
        </label>
        <input
          id="calc-amount"
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="$300,000"
          className="w-full rounded-sm border bg-white px-3 py-2.5 text-base outline-none focus-visible:ring-2"
          style={{ borderColor: "rgba(20,61,74,0.3)", color: "#1E1E1E", ["--tw-ring-color" as string]: TEAL }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: "#1E1E1E" }}>
        <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} className="size-4" />
        Funding needed same day (adds 0.25%)
      </label>
      <CostSummary amount={Number.isFinite(amount) && raw.trim() !== "" ? amount : null} sameDay={sameDay} tone="light" />
    </div>
  );
}
