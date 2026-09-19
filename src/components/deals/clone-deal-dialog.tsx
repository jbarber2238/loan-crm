"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow as rethrowFrameworkSignals } from "next/navigation";
import { toast } from "sonner";
import { getCloneSourceData, cloneNewConstructionDeal } from "@/server/actions/deal-clone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CloneSourceData = Awaited<ReturnType<typeof getCloneSourceData>>;

function money(value: string | null): string {
  return value ? `$${Number(value).toLocaleString()}` : "not on file";
}

export function CloneDealDialog({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<CloneSourceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [addressType, setAddressType] = useState<"address" | "parcel">("address");
  const [costsIdentical, setCostsIdentical] = useState(true);
  const [copyTermSheetId, setCopyTermSheetId] = useState<string>("");
  const [copyNeedIds, setCopyNeedIds] = useState<Set<string>>(new Set());

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setLoading(true);
    setCostsIdentical(true);
    setCopyNeedIds(new Set());
    getCloneSourceData(dealId)
      .then((data) => {
        setSource(data);
        const accepted = data.termSheets.find((t) => t.status === "accepted");
        setCopyTermSheetId(accepted?.id ?? data.termSheets[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this deal."))
      .finally(() => setLoading(false));
  }

  function toggleNeed(id: string, checked: boolean) {
    setCopyNeedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("costsIdentical", costsIdentical ? "yes" : "no");
    if (costsIdentical && copyTermSheetId) formData.set("copyTermSheetId", copyTermSheetId);
    for (const id of copyNeedIds) formData.append("copyClientNeedIds", id);

    startTransition(async () => {
      try {
        await cloneNewConstructionDeal(dealId, formData);
      } catch (err) {
        rethrowFrameworkSignals(err); // a successful clone redirects — let that through
        setError(err instanceof Error ? err.message : "Couldn't clone this deal.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Clone Loan</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clone this loan</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error && !source ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : source ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-muted-foreground">
              For another build with {source.borrowerName} — same borrower, same team, a fresh loan for a different
              property. Only what&apos;s different needs to change below.
            </p>

            <div className="space-y-3">
              <p className="text-sm font-medium">New property</p>
              <div className="space-y-1.5">
                <Label htmlFor="clone-addressType">What do you have for this property?</Label>
                <Select
                  value={addressType}
                  onValueChange={(v) => setAddressType(v as "address" | "parcel")}
                >
                  <SelectTrigger id="clone-addressType" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="address">A street address</SelectItem>
                    <SelectItem value="parcel">Only a parcel ID / APN</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="addressType" value={addressType} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {addressType === "parcel" ? (
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="clone-parcelId">Parcel ID / APN</Label>
                    <Input id="clone-parcelId" name="parcelId" required />
                  </div>
                ) : (
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="clone-streetAddress">Street Address</Label>
                    <Input id="clone-streetAddress" name="streetAddress" required />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="clone-city">City</Label>
                  <Input id="clone-city" name="city" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clone-state">State</Label>
                  <Input id="clone-state" name="state" required />
                </div>
              </div>
              <div className="max-w-32 space-y-1.5">
                <Label htmlFor="clone-postalCode">Postal Code</Label>
                <Input id="clone-postalCode" name="postalCode" required />
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Costs</p>
              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="clone-costsIdentical">
                  Are the purchase price ({money(source.purchasePrice)}) and construction budget (
                  {money(source.estimatedRehabCost)}) identical for this build?
                </Label>
                <Select value={costsIdentical ? "yes" : "no"} onValueChange={(v) => setCostsIdentical(v === "yes")}>
                  <SelectTrigger id="clone-costsIdentical" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes — identical</SelectItem>
                    <SelectItem value="no">No — different for this one</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!costsIdentical && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="clone-purchasePrice">Land Purchase Price</Label>
                    <Input
                      id="clone-purchasePrice"
                      name="purchasePrice"
                      type="number"
                      defaultValue={source.purchasePrice ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clone-estimatedRehabCost">Construction Budget</Label>
                    <Input
                      id="clone-estimatedRehabCost"
                      name="estimatedRehabCost"
                      type="number"
                      defaultValue={source.estimatedRehabCost ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clone-estimatedArv">Estimated ARV</Label>
                    <Input
                      id="clone-estimatedArv"
                      name="estimatedArv"
                      type="number"
                      defaultValue={source.estimatedArv ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clone-loanAmountRequested">Loan Amount Requested</Label>
                    <Input
                      id="clone-loanAmountRequested"
                      name="loanAmountRequested"
                      type="number"
                      defaultValue={source.loanAmountRequested ?? ""}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {costsIdentical && source.termSheets.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Term sheet</p>
                <p className="text-xs text-muted-foreground">
                  Since the costs are identical, the lender terms below can carry straight over — the new deal
                  starts with a matching draft term sheet, ready to generate.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="clone-termSheet">Copy which term sheet?</Label>
                  <Select value={copyTermSheetId} onValueChange={setCopyTermSheetId}>
                    <SelectTrigger id="clone-termSheet" className="w-full">
                      <SelectValue placeholder="Don't copy a term sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Don&apos;t copy a term sheet</SelectItem>
                      {source.termSheets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.lenderName} — {t.productName}
                          {t.interestRate !== null ? ` — ${t.interestRate}%` : ""}
                          {t.loanAmount !== null ? `, ${money(String(t.loanAmount))}` : ""}
                          {t.status === "accepted" ? " (accepted)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {source.clientNeeds.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Documents</p>
                <p className="text-xs text-muted-foreground">
                  Sort through which of the original&apos;s documents actually belong on this new loan too — e.g.
                  architectural plans or a construction budget that&apos;s the same or nearly the same. Nothing is
                  copied unless it&apos;s checked.
                </p>
                <div className="space-y-2">
                  {source.clientNeeds.map((need) => (
                    <div key={need.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={copyNeedIds.has(need.id)}
                          onCheckedChange={(v) => toggleNeed(need.id, v === true)}
                        />
                        <span>
                          {need.itemName}
                          {need.documents.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              ({need.documents.length} file{need.documents.length === 1 ? "" : "s"})
                            </span>
                          )}
                        </span>
                      </label>
                      {need.documents[0] && (
                        <a
                          href={`/api/client-need-documents/${need.documents[0].id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating…" : "Create Cloned Loan"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
