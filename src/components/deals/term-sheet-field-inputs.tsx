"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReactNode } from "react";
import type { TermSheetField } from "@/lib/term-sheet-fields";
import { ratioMetricsFor } from "@/lib/term-sheet-calculations";

const MIN_ORIGINATION_FEE = 2500;

// Explicit display order per group — independent of the order fields come
// back in from termSheetFieldsFor(), so "move X below Y" is just a matter of
// reordering these lists, not the underlying field definitions.
const LENDER_PRODUCT_KEYS = [
  "loanTermYears",
  "loanTermMonths",
  "interestRate",
  "amortizationType",
  "lienPosition",
  "interestType",
  "exitStrategy",
  "extensionTerms",
];
const ADDITIONAL_TERM_KEYS = ["creditPullType", "prepaymentPenalty"];
const BROKER_FEE_KEYS = ["originationPoints", "originationFee", "rateBuydownPoints"];
const LOAN_NUMBER_KEYS = ["loanAmount", "initialAdvance", "approvedRehabCost", "reservesMonths", "reservesRequired", "approvedArv"];
const LENDER_FEE_KEYS = ["underwritingDocFee"];

function pickInOrder(fields: TermSheetField[], keys: string[]): TermSheetField[] {
  const byKey = new Map(fields.map((f) => [f.key, f] as const));
  return keys.map((k) => byKey.get(k)).filter((f): f is TermSheetField => f !== undefined);
}

// costToBorrowerFee means something different per category (see
// term-sheet-fields.ts) — a DSCR/Portfolio "Rate Buydown Fee" is our own
// negotiated discount, grouped with Broker Fees; a hard-money/bridge
// "Lender Fee" is the lender's own quoted charge, grouped with Lender Fees.
function groupFields(fields: TermSheetField[]) {
  const hasRateBuydown = fields.some((f) => f.key === "rateBuydownPoints");
  const costToBorrowerFee = fields.find((f) => f.key === "costToBorrowerFee");

  const lenderProductInfo = pickInOrder(fields, LENDER_PRODUCT_KEYS);
  const additionalTerms = pickInOrder(fields, ADDITIONAL_TERM_KEYS);
  const brokerFees = [
    ...pickInOrder(fields, BROKER_FEE_KEYS),
    ...(hasRateBuydown && costToBorrowerFee ? [costToBorrowerFee] : []),
  ];
  const loanNumbers = pickInOrder(fields, LOAN_NUMBER_KEYS);
  const lenderFees = [
    ...(!hasRateBuydown && costToBorrowerFee ? [costToBorrowerFee] : []),
    ...pickInOrder(fields, LENDER_FEE_KEYS),
  ];
  const internal = fields.filter((f) => f.adminOnly);

  // Defensive: a field key not claimed by any group above still has to show
  // up somewhere, so a future field addition can't silently disappear.
  const claimed = new Set(
    [...lenderProductInfo, ...additionalTerms, ...brokerFees, ...loanNumbers, ...lenderFees, ...internal].map(
      (f) => f.key
    )
  );
  const unclaimed = fields.filter((f) => !claimed.has(f.key));

  return {
    lenderProductInfo: [...lenderProductInfo, ...unclaimed],
    additionalTerms,
    brokerFees,
    loanNumbers,
    lenderFees,
    internal,
  };
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function RatioDisplay({ label, valuePct }: { label: string; valuePct: number | null }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
        {valuePct !== null ? `${valuePct.toFixed(1)}%` : "—"}
      </div>
      <p className="text-xs text-muted-foreground">Calculated automatically.</p>
    </div>
  );
}

function computeOriginationFee(loanAmount: string, points: string): string {
  const la = Number(loanAmount);
  const pts = Number(points);
  if (!(la > 0) || !(pts >= 0)) return "";
  return String(Math.max(Math.round(la * (pts / 100)), MIN_ORIGINATION_FEE));
}

// No floor — unlike origination fee, a rate buydown genuinely can be $0.
function computeRateBuydownFee(loanAmount: string, points: string): string {
  const la = Number(loanAmount);
  const pts = Number(points);
  if (!(la > 0) || !(pts >= 0)) return "";
  return String(Math.round(la * (pts / 100)));
}

export function TermSheetFieldInputs({
  fields,
  values = {},
  productSelector,
  category,
  purchasePrice = null,
  estimatedAsIsValue = null,
}: {
  fields: TermSheetField[];
  values?: Record<string, unknown>;
  // Rendered at the top of the Lender / Product Info group — the picker
  // lives in the parent form (it drives which fields even show up here),
  // but visually it belongs grouped with the rest of the loan's own terms.
  productSelector?: ReactNode;
  // Needed to auto-calculate LTARV/LTC/LTV alongside the loan numbers —
  // purchasePrice and estimatedAsIsValue come from the deal, not this form.
  category?: string;
  purchasePrice?: number | null;
  estimatedAsIsValue?: number | null;
}) {
  // loanAmount, originationPoints, and originationFee are linked — editing
  // loan amount or points recalculates the fee live. Same relationship
  // between rateBuydownPoints and costToBorrowerFee, when that field is
  // present (DSCR/Portfolio only). approvedRehabCost and approvedArv are
  // tracked too so LTARV/LTC can recalculate live alongside them. Every
  // other field stays a plain uncontrolled input.
  const hasRateBuydownPoints = fields.some((f) => f.key === "rateBuydownPoints");

  const initialLoanAmount = String(values.loanAmount ?? "");
  const initialPoints = String(values.originationPoints ?? "2");
  const initialFee = String(
    values.originationFee ?? computeOriginationFee(initialLoanAmount, initialPoints) ?? ""
  );
  const initialBuydownPoints = String(values.rateBuydownPoints ?? "0");
  const initialBuydownFee = String(
    values.costToBorrowerFee ?? computeRateBuydownFee(initialLoanAmount, initialBuydownPoints) ?? ""
  );

  const [loanAmount, setLoanAmount] = useState(initialLoanAmount);
  const [points, setPoints] = useState(initialPoints);
  const [fee, setFee] = useState(initialFee);
  const [buydownPoints, setBuydownPoints] = useState(initialBuydownPoints);
  const [buydownFee, setBuydownFee] = useState(initialBuydownFee);
  const [rehabCost, setRehabCost] = useState(String(values.approvedRehabCost ?? ""));
  const [arv, setArv] = useState(String(values.approvedArv ?? ""));

  function handleLoanAmountChange(v: string) {
    setLoanAmount(v);
    const computed = computeOriginationFee(v, points);
    if (computed) setFee(computed);
    if (hasRateBuydownPoints) {
      const buydownComputed = computeRateBuydownFee(v, buydownPoints);
      if (buydownComputed) setBuydownFee(buydownComputed);
    }
  }

  function handlePointsChange(v: string) {
    setPoints(v);
    const computed = computeOriginationFee(loanAmount, v);
    if (computed) setFee(computed);
  }

  function handleBuydownPointsChange(v: string) {
    setBuydownPoints(v);
    const computed = computeRateBuydownFee(loanAmount, v);
    if (computed) setBuydownFee(computed);
  }

  const { lenderProductInfo, additionalTerms, brokerFees, loanNumbers, lenderFees, internal } = groupFields(fields);

  const ratios = category
    ? ratioMetricsFor(category, {
        loanAmount: Number(loanAmount) || 0,
        purchasePrice,
        estimatedAsIsValue,
        approvedArv: Number(arv) || null,
        approvedRehabCost: Number(rehabCost) || null,
      })
    : [];

  function renderField(field: TermSheetField) {
    const defaultValue = values[field.key] ?? field.defaultValue;
    return (
      <div key={field.key} className={`space-y-1.5 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>
        <Label htmlFor={field.key}>
          {field.label} {field.adminOnly && <span className="text-muted-foreground">(internal)</span>}
        </Label>
        {field.key === "loanAmount" ? (
          <Input
            id={field.key}
            name={field.key}
            type="number"
            value={loanAmount}
            onChange={(e) => handleLoanAmountChange(e.target.value)}
          />
        ) : field.key === "approvedRehabCost" ? (
          <Input
            id={field.key}
            name={field.key}
            type="number"
            value={rehabCost}
            onChange={(e) => setRehabCost(e.target.value)}
          />
        ) : field.key === "approvedArv" ? (
          <Input id={field.key} name={field.key} type="number" value={arv} onChange={(e) => setArv(e.target.value)} />
        ) : field.key === "originationPoints" ? (
          <Input
            id={field.key}
            name={field.key}
            type="number"
            step="0.01"
            value={points}
            onChange={(e) => handlePointsChange(e.target.value)}
          />
        ) : field.key === "originationFee" ? (
          <Input id={field.key} name={field.key} type="number" value={fee} readOnly className="bg-muted" />
        ) : field.key === "rateBuydownPoints" ? (
          <Input
            id={field.key}
            name={field.key}
            type="number"
            step="0.01"
            value={buydownPoints}
            onChange={(e) => handleBuydownPointsChange(e.target.value)}
          />
        ) : field.key === "costToBorrowerFee" && hasRateBuydownPoints ? (
          <Input id={field.key} name={field.key} type="number" value={buydownFee} readOnly className="bg-muted" />
        ) : field.type === "select" ? (
          <Select name={field.key} defaultValue={typeof defaultValue === "string" ? defaultValue : undefined}>
            <SelectTrigger id={field.key} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === "textarea" ? (
          <Textarea
            id={field.key}
            name={field.key}
            rows={3}
            defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
          />
        ) : (
          <Input
            id={field.key}
            name={field.key}
            type={
              field.type === "number" || field.type === "currency" || field.type === "percent"
                ? "number"
                : field.type === "url"
                  ? "url"
                  : "text"
            }
            step={field.type === "percent" ? "0.001" : undefined}
            defaultValue={typeof defaultValue === "string" || typeof defaultValue === "number" ? defaultValue : ""}
          />
        )}
        {field.helperText && <p className="text-xs text-muted-foreground">{field.helperText}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <FieldGroup title="Lender / Product Info">
            {productSelector}
            {lenderProductInfo.map(renderField)}
          </FieldGroup>
          {additionalTerms.length > 0 && (
            <FieldGroup title="Additional Terms">{additionalTerms.map(renderField)}</FieldGroup>
          )}
          {brokerFees.length > 0 && <FieldGroup title="Broker Fees">{brokerFees.map(renderField)}</FieldGroup>}
        </div>
        <div className="space-y-4">
          <FieldGroup title="Loan Numbers">
            {loanNumbers.map(renderField)}
            {ratios.map((r) => (
              <RatioDisplay key={r.label} label={r.label} valuePct={r.valuePct} />
            ))}
          </FieldGroup>
          {lenderFees.length > 0 && <FieldGroup title="Lender Fees">{lenderFees.map(renderField)}</FieldGroup>}
        </div>
      </div>
      {internal.length > 0 && <FieldGroup title="Internal Notes">{internal.map(renderField)}</FieldGroup>}
    </div>
  );
}
