"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { monthsOwned, ownedSentence, parseMonthInput } from "@/lib/borrower-experience";

type Kind = "flips" | "newConstruction";

const KINDS: Record<
  Kind,
  {
    field: string;
    title: string;
    blurb: string;
    inputLabel: string;
    counts: string[];
    doesNot: string[];
    one: string;
    many: string;
    dialogTitle: (n: number) => string;
    dialogIntro: (n: number) => string;
    dialogNote: string;
  }
> = {
  flips: {
    field: "numFlips",
    title: "Completed flips",
    blurb: "Fix and flip projects you finished in the last 36 months.",
    inputLabel: "# of flips",
    counts: [
      "You bought it and were on title, personally or through an entity you are part of",
      "You renovated it",
      "You finished it by selling or refinancing it",
    ],
    doesNot: ["A flip you are still working on", "A joint venture deal where you were not on title"],
    one: "flip",
    many: "flips",
    dialogTitle: (n) => `Before we count ${n === 1 ? "this flip" : "these flips"}`,
    dialogIntro: (n) => `You entered ${n} completed ${n === 1 ? "flip" : "flips"}. ${n === 1 ? "It has" : "Each one has"} to meet all of these:`,
    dialogNote: "A flip you are still working on does not count yet. Neither does a joint venture deal where you were not on title.",
  },
  newConstruction: {
    field: "numNewConstruction",
    title: "Completed new construction",
    blurb: "Ground-up builds you finished in the last 36 months.",
    inputLabel: "# of new construction",
    counts: [
      "You bought the lot and were on title, personally or through an entity you are part of",
      "You built the property",
      "You finished it by selling or refinancing it",
    ],
    doesNot: ["A build you are still working on", "A joint venture deal where you were not on title"],
    one: "new construction project",
    many: "new construction projects",
    dialogTitle: (n) => `Before we count ${n === 1 ? "this build" : "these builds"}`,
    dialogIntro: (n) =>
      `You entered ${n} completed new construction ${n === 1 ? "project" : "projects"}. ${n === 1 ? "It has" : "Each one has"} to meet all of these:`,
    dialogNote: "A build you are still working on does not count yet. Neither does a joint venture deal where you were not on title.",
  },
};

function toCount(value: string): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

function RuleBox({ tone, heading, items }: { tone: "yes" | "no"; heading: string; items: string[] }) {
  const Icon = tone === "yes" ? Check : X;
  return (
    <div
      className={cn(
        "rounded-lg p-3 text-sm",
        tone === "yes" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30"
      )}
    >
      <p
        className={cn(
          "mb-1.5 text-[11px] font-bold tracking-wider uppercase",
          tone === "yes" ? "text-emerald-800 dark:text-emerald-400" : "text-rose-800 dark:text-rose-400"
        )}
      >
        {heading}
      </p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2">
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", tone === "yes" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}
              aria-hidden="true"
            />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Borrower Experience part of the intake form. Spells out what counts as a completed flip or new construction,
 * asks the borrower to confirm it in a pop-up, and asks when a single rental was bought. Staff entering a deal on a
 * borrower's behalf confirm it the same way. askConfirmation off only shows the rules, with nothing to confirm.
 */
export function BorrowerExperienceFields({
  defaultValues,
  highlightNames,
  askConfirmation = true,
  Req,
}: {
  defaultValues?: Record<string, string | undefined>;
  highlightNames?: Set<string>;
  askConfirmation?: boolean;
  Req: () => React.ReactElement;
}) {
  const dv = (name: string) => defaultValues?.[name] ?? "";
  const carriedOver = (name: string) => highlightNames?.has(name) ?? false;
  const alreadyConfirmed = dv("experienceConfirmed") === "yes";

  const [values, setValues] = useState<Record<Kind, string>>({ flips: dv("numFlips"), newConstruction: dv("numNewConstruction") });
  // The count the borrower confirmed. A number carried over from an earlier deal they confirmed starts out confirmed.
  const [confirmed, setConfirmed] = useState<Record<Kind, number | null>>({
    flips: alreadyConfirmed && toCount(dv("numFlips")) > 0 ? toCount(dv("numFlips")) : null,
    newConstruction: alreadyConfirmed && toCount(dv("numNewConstruction")) > 0 ? toCount(dv("numNewConstruction")) : null,
  });
  const [declined, setDeclined] = useState<Record<Kind, boolean>>({ flips: false, newConstruction: false });
  const [rentals, setRentals] = useState(dv("numRentals"));
  const [rentalMonth, setRentalMonth] = useState(dv("singleRentalPurchaseDate"));
  const [dialogKind, setDialogKind] = useState<Kind | null>(null);
  const [ticked, setTicked] = useState(false);
  // The pop-up renders outside the form card, so it copies the card's font and theme colors (the branded intake pages
  // re-theme them on the card) instead of falling back to the app defaults.
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<Kind, HTMLInputElement | null>>({ flips: null, newConstruction: null });

  const counts = { flips: toCount(values.flips), newConstruction: toCount(values.newConstruction) };
  const isConfirmed = (k: Kind) => counts[k] === 0 || confirmed[k] === counts[k];
  const allConfirmed = isConfirmed("flips") && isConfirmed("newConstruction");
  const firstUnconfirmed = (["flips", "newConstruction"] as Kind[]).find((k) => !isConfirmed(k)) ?? null;

  // A number that never went through the pop-up (pasted in, autofilled) is still asked about when the form is submitted.
  const pendingRef = useRef<Kind | null>(null);
  pendingRef.current = askConfirmation ? firstUnconfirmed : null;
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    function onSubmit(e: Event) {
      const kind = pendingRef.current;
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      openDialog(kind);
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  function openDialog(kind: Kind) {
    if (rootRef.current) {
      const cs = getComputedStyle(rootRef.current);
      const style: Record<string, string> = { fontFamily: cs.fontFamily };
      for (const v of ["--primary", "--primary-foreground", "--ring", "--input", "--border", "--accent", "--accent-foreground"]) {
        const value = cs.getPropertyValue(v).trim();
        if (value) style[v] = value;
      }
      setPopupStyle(style as CSSProperties);
    }
    setTicked(false);
    setDialogKind(kind);
  }

  function onCountChange(kind: Kind, value: string) {
    setValues((v) => ({ ...v, [kind]: value }));
    if (toCount(value) > 0) setDeclined((d) => ({ ...d, [kind]: false }));
  }

  function onCountBlur(kind: Kind) {
    if (askConfirmation && counts[kind] > 0 && confirmed[kind] !== counts[kind]) openDialog(kind);
  }

  function confirmDialog() {
    if (!dialogKind) return;
    setConfirmed((c) => ({ ...c, [dialogKind]: counts[dialogKind] }));
    setDialogKind(null);
  }

  function declineDialog() {
    if (!dialogKind) return;
    const kind = dialogKind;
    setValues((v) => ({ ...v, [kind]: "" }));
    setConfirmed((c) => ({ ...c, [kind]: null }));
    setDeclined((d) => ({ ...d, [kind]: true }));
    setDialogKind(null);
    // Radix would return focus to wherever it was; the borrower should land back in the box to re-enter a number.
    requestAnimationFrame(() => inputRefs.current[kind]?.focus());
  }

  const single = rentals.trim() !== "" && parseInt(rentals, 10) === 1;
  const since = parseMonthInput(rentalMonth);
  const months = since ? monthsOwned(since) : null;

  const dialog = dialogKind ? KINDS[dialogKind] : null;
  const dialogCount = dialogKind ? counts[dialogKind] : 0;

  return (
    <div ref={rootRef} className="space-y-4">
      {/* Only a yes goes to the server; it records when the borrower confirmed. */}
      {askConfirmation && <input type="hidden" name="experienceConfirmed" value={allConfirmed ? "yes" : ""} />}

      <div>
        <Label>
          Borrower Experience
          <Req />
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 36 months. <strong className="font-semibold text-foreground">Count only deals that are finished.</strong> Pricing
          depends on an answer for all three, so enter 0 if none.
        </p>
      </div>

      {(["flips", "newConstruction"] as Kind[]).map((kind) => {
        const k = KINDS[kind];
        const n = counts[kind];
        return (
          <div key={kind} className="space-y-3 rounded-xl border bg-background/60 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem] sm:gap-4">
              <div>
                <h3 className="text-base font-semibold">{k.title}</h3>
                <p className="text-sm text-muted-foreground">{k.blurb}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={k.field} className="text-sm text-muted-foreground">
                  {k.inputLabel}
                </Label>
                <Input
                  ref={(el) => {
                    inputRefs.current[kind] = el;
                  }}
                  id={k.field}
                  name={k.field}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={values[kind]}
                  onChange={(e) => onCountChange(kind, e.target.value)}
                  onBlur={() => onCountBlur(kind)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RuleBox tone="yes" heading="Counts" items={k.counts} />
              <RuleBox tone="no" heading="Does not count" items={k.doesNot} />
            </div>
            {carriedOver(k.field) && !(askConfirmation && n > 0 && confirmed[kind] === n) && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-500">Carried over — please confirm.</p>
            )}
            {askConfirmation && n > 0 && confirmed[kind] === n && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" role="status">
                <Check className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  Confirmed: {n} {n === 1 ? k.one : k.many} meet every point above.
                </span>
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold underline"
                  onClick={() => inputRefs.current[kind]?.focus()}
                >
                  Change
                </button>
              </div>
            )}
            {askConfirmation && n > 0 && confirmed[kind] !== n && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-400" role="status">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                <span>We need you to confirm {n === 1 ? "this one" : "these"} before you submit.</span>
                <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => openDialog(kind)}>
                  Confirm now
                </button>
              </div>
            )}
            {declined[kind] && n === 0 && (
              <div className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-400" role="status">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                <span>Enter only the ones that fully qualify. Enter 0 if none.</span>
              </div>
            )}
          </div>
        );
      })}

      <div className="space-y-3 rounded-xl border bg-background/60 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem] sm:gap-4">
          <div>
            <h3 className="text-base font-semibold">Rentals you own</h3>
            <p className="text-sm text-muted-foreground">Rental properties you hold on title, personally or through your entity.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numRentals" className="text-sm text-muted-foreground">
              # of rentals
            </Label>
            <Input
              id="numRentals"
              name="numRentals"
              type="number"
              min={0}
              inputMode="numeric"
              value={rentals}
              onChange={(e) => setRentals(e.target.value)}
              required
            />
          </div>
        </div>
        {carriedOver("numRentals") && <p className="text-xs font-medium text-amber-700 dark:text-amber-500">Carried over — please confirm.</p>}
        {single && (
          <div className="grid grid-cols-1 items-end gap-3 border-t border-dashed pt-3 sm:grid-cols-2 sm:gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="singleRentalPurchaseDate">
                When did you buy it?
                <Req />
              </Label>
              <p className="text-sm text-muted-foreground">Lenders look at how long you have owned a single rental. Month and year is enough.</p>
            </div>
            <Input
              id="singleRentalPurchaseDate"
              name="singleRentalPurchaseDate"
              type="month"
              value={rentalMonth}
              onChange={(e) => setRentalMonth(e.target.value)}
              required
            />
            <p
              className={cn("flex min-h-9 items-center text-sm font-medium", months !== null && months < 0 ? "text-destructive" : "text-primary")}
              aria-live="polite"
              suppressHydrationWarning
            >
              {months === null ? "" : ownedSentence(months)}
            </p>
          </div>
        )}
      </div>

      <Dialog open={dialogKind !== null} onOpenChange={(open) => !open && setDialogKind(null)}>
        <DialogContent className="sm:max-w-lg" style={popupStyle}>
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.dialogTitle(dialogCount)}</DialogTitle>
                <DialogDescription>{dialog.dialogIntro(dialogCount)}</DialogDescription>
              </DialogHeader>
              <ul className="space-y-2.5 text-sm">
                {dialog.counts.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">{dialog.dialogNote}</p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-sm font-medium">
                <Checkbox checked={ticked} onCheckedChange={(v) => setTicked(v === true)} className="mt-0.5" />
                <span>
                  {dialogCount === 1
                    ? `I confirm this ${dialog.one} meets every point above.`
                    : `I confirm all ${dialogCount} ${dialog.many} meet every point above.`}
                </span>
              </label>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button type="button" disabled={!ticked} onClick={confirmDialog} className="w-full">
                  Confirm and continue
                </Button>
                <Button type="button" variant="outline" onClick={declineDialog} className="w-full">
                  Some of these do not count
                </Button>
              </DialogFooter>
              <p className="text-xs text-muted-foreground">
                Entering a lower number is always fine. Counting a deal that does not qualify only slows your pricing down later.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
