"use client";

import { useState } from "react";
import {
  calculateDscrRatio,
  calculateLtarv,
  calculateLtc,
  estimatedMonthlyPI,
  estimatedMonthlyPitia,
} from "@/lib/term-sheet-calculations";

const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium tracking-wide" style={{ color: BASALT }}>
        {label}
      </span>
      <div className="mt-1.5 flex items-center rounded-sm border bg-white" style={{ borderColor: "rgba(30,30,30,0.2)" }}>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
          style={{ color: BASALT }}
        />
        {suffix && (
          <span className="pr-3 text-sm" style={{ color: MOSS }}>
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t py-2.5" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <span className="text-sm" style={{ color: BASALT }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: TEAL }}>
        {value}
      </span>
    </div>
  );
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function DscrCalculator() {
  const [rent, setRent] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("30");
  const [taxes, setTaxes] = useState("");
  const [insurance, setInsurance] = useState("");
  const [hoa, setHoa] = useState("");

  const monthlyPI = estimatedMonthlyPI(num(loanAmount), num(rate), num(term) || 30);
  const monthlyPitia = estimatedMonthlyPitia(monthlyPI, num(taxes) || null, num(insurance) || null, num(hoa) || null);
  const dscr = calculateDscrRatio(num(rent) || null, monthlyPitia);

  const hasInputs = loanAmount && rate && rent;

  return (
    <div className="rounded-sm border bg-white p-6 md:p-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <h3 className="text-lg font-medium" style={{ color: TEAL }}>
        DSCR Calculator
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BASALT }}>
        Debt Service Coverage Ratio compares a property&apos;s rental income to its total monthly payment. A DSCR
        of 1.0 or higher means the property&apos;s rent covers the debt itself — the core number a DSCR loan
        qualifies against instead of your personal income.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Monthly Rental Income" value={rent} onChange={setRent} placeholder="2,500" />
        <Field label="Loan Amount" value={loanAmount} onChange={setLoanAmount} placeholder="300,000" />
        <Field label="Interest Rate" value={rate} onChange={setRate} suffix="%" placeholder="7.5" />
        <Field label="Loan Term" value={term} onChange={setTerm} suffix="years" placeholder="30" />
        <Field label="Annual Taxes" value={taxes} onChange={setTaxes} placeholder="3,600" />
        <Field label="Annual Insurance" value={insurance} onChange={setInsurance} placeholder="1,800" />
        <Field label="Annual HOA (optional)" value={hoa} onChange={setHoa} placeholder="0" />
      </div>
      {hasInputs && (
        <div className="mt-6">
          <ResultRow label="Monthly Principal & Interest" value={money(monthlyPI)} />
          <ResultRow label="Total Monthly Payment (PITIA)" value={money(monthlyPitia)} />
          <div className="flex items-baseline justify-between border-t py-3" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
            <span className="text-sm font-medium" style={{ color: BASALT }}>
              Your DSCR
            </span>
            <span className="text-2xl font-medium" style={{ color: TEAL }}>
              {dscr !== null ? dscr.toFixed(2) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function LtcCalculator() {
  const [purchasePrice, setPurchasePrice] = useState("");
  const [rehabCost, setRehabCost] = useState("");
  const [loanAmount, setLoanAmount] = useState("");

  const ltc = calculateLtc(num(loanAmount), num(purchasePrice) || null, num(rehabCost) || null);
  const hasInputs = purchasePrice && loanAmount;

  return (
    <div className="rounded-sm border bg-white p-6 md:p-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <h3 className="text-lg font-medium" style={{ color: TEAL }}>
        Loan-to-Cost (LTC) Calculator
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BASALT }}>
        Loan-to-Cost compares your loan amount to the total cost of the project — purchase price plus rehab or
        construction budget. It&apos;s the number fix &amp; flip and ground-up construction loans size against.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} placeholder="200,000" />
        <Field label="Rehab / Construction Budget" value={rehabCost} onChange={setRehabCost} placeholder="80,000" />
        <Field label="Loan Amount" value={loanAmount} onChange={setLoanAmount} placeholder="240,000" />
      </div>
      {hasInputs && (
        <div className="mt-6 flex items-baseline justify-between border-t py-3" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
          <span className="text-sm font-medium" style={{ color: BASALT }}>
            Your LTC
          </span>
          <span className="text-2xl font-medium" style={{ color: TEAL }}>
            {ltc !== null ? `${ltc.toFixed(1)}%` : "—"}
          </span>
        </div>
      )}
    </div>
  );
}

export function LtarvCalculator() {
  const [arv, setArv] = useState("");
  const [loanAmount, setLoanAmount] = useState("");

  const ltarv = calculateLtarv(num(loanAmount), num(arv) || null);
  const hasInputs = arv && loanAmount;

  return (
    <div className="rounded-sm border bg-white p-6 md:p-8" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
      <h3 className="text-lg font-medium" style={{ color: TEAL }}>
        Loan-to-ARV (LTARV) Calculator
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BASALT }}>
        Loan-to-After-Repair-Value compares your loan amount to what the property will be worth once repairs or
        construction are complete — the leverage ceiling most hard money and construction programs are capped
        against.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="After-Repair Value (ARV)" value={arv} onChange={setArv} placeholder="400,000" />
        <Field label="Loan Amount" value={loanAmount} onChange={setLoanAmount} placeholder="280,000" />
      </div>
      {hasInputs && (
        <div className="mt-6 flex items-baseline justify-between border-t py-3" style={{ borderColor: "rgba(20,61,74,0.15)" }}>
          <span className="text-sm font-medium" style={{ color: BASALT }}>
            Your LTARV
          </span>
          <span className="text-2xl font-medium" style={{ color: TEAL }}>
            {ltarv !== null ? `${ltarv.toFixed(1)}%` : "—"}
          </span>
        </div>
      )}
    </div>
  );
}
