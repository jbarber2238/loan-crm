"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  extractConditionsFromEmail,
  toggleConditionCleared,
  deleteCondition,
  linkConditionToClientNeed,
  markConditionsSentToLender,
} from "@/server/actions/conditions";
import { addKeyDateEvent } from "@/server/actions/key-date-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { AddClientNeedToDealDialog, type ConditionToCover, type DealCatalogItem } from "@/components/deals/add-client-need-to-deal-dialog";
import { DealFileUploadForm } from "@/components/deals/deal-file-parts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canMarkSentToLender, conditionOwner, needsClientNeed, type ConditionOwner } from "@/lib/condition-owner";
import { currentEventFor, type KeyDateEvent } from "@/lib/key-date-tracker";
import { stageLargeFiles } from "@/lib/stage-large-files";
import { stageUploadChunk } from "@/server/actions/staged-upload";

export interface DealCondition {
  id: string;
  description: string;
  category: "title" | "insurance" | "borrower" | "other";
  status: "open" | "cleared";
  suggestedNeedName: string | null;
  suggestedNeedDescription: string | null;
  linkedClientNeedId: string | null;
  /** When the processor marked this condition sent to the lender (null until then). */
  sentToLenderAt: Date | null;
  /** The client need made from this condition: where it stands decides who the condition is waiting on. */
  linkedNeed: { status: string; onHoldAt: Date | null } | null;
}

const OWNER_BADGE: Record<ConditionOwner["tone"], "outline" | "warning" | "secondary" | "success"> = {
  muted: "outline",
  warning: "warning",
  info: "secondary",
  success: "success",
  outline: "outline",
};

const CATEGORY_SECTIONS: { key: DealCondition["category"]; title: string; description: string }[] = [
  { key: "borrower", title: "Borrower Conditions", description: "Ours to collect from the borrower." },
  { key: "title", title: "Title Conditions", description: "Title company's responsibility — tracked here." },
  { key: "insurance", title: "Insurance Conditions", description: "Tracked here — not something we chase the borrower for." },
  { key: "other", title: "Other Conditions", description: "Didn't clearly fit the categories above." },
];

function ConditionRow({
  dealId,
  condition,
  selected,
  onSelect,
  onAddNeed,
  onCleared,
}: {
  dealId: string;
  condition: DealCondition;
  /** Borrower conditions are picked with the checkbox (to act on several at once) instead of being checked off by it. */
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onAddNeed: (condition: DealCondition) => void;
  /** Called after this condition is checked off, so title and insurance can offer an upload. */
  onCleared: (condition: DealCondition) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cleared = condition.status === "cleared";
  const isBorrower = condition.category === "borrower";
  const owner = conditionOwner(condition);
  const readyForLender = canMarkSentToLender(condition);

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      try {
        await toggleConditionCleared(dealId, condition.id, checked);
        router.refresh();
        if (checked) onCleared(condition);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update that condition.");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("Remove this condition?")) return;
    startTransition(async () => {
      try {
        await deleteCondition(dealId, condition.id);
        toast.success("Condition removed");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't remove that condition.");
      }
    });
  }

  function setSentToLender(sent: boolean) {
    startTransition(async () => {
      try {
        await markConditionsSentToLender(dealId, [condition.id], sent);
        toast.success(sent ? "Marked sent to the lender" : "Taken back: the condition is open again");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update that condition.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
      <label className="flex min-w-0 flex-1 items-start gap-2.5">
        {isBorrower ? (
          <Checkbox
            checked={selected}
            disabled={pending || cleared}
            onCheckedChange={(v) => onSelect(v === true)}
            aria-label="Select this condition"
            className="mt-0.5"
          />
        ) : (
          <Checkbox checked={cleared} disabled={pending} onCheckedChange={(v) => handleToggle(v === true)} className="mt-0.5" />
        )}
        <span className="min-w-0">
          <span className={`text-sm ${cleared ? "text-muted-foreground line-through" : ""}`}>{condition.description}</span>
          {isBorrower && owner?.hint && <span className="block text-xs text-muted-foreground">{owner.hint}</span>}
        </span>
      </label>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {isBorrower && owner && <Badge variant={OWNER_BADGE[owner.tone]}>{owner.label}</Badge>}
        {isBorrower && cleared && !condition.sentToLenderAt && condition.linkedClientNeedId && <Badge variant="secondary">Added to Client Needs</Badge>}
        {needsClientNeed(condition) && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => onAddNeed(condition)}>
            Add a client need
          </Button>
        )}
        {readyForLender && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setSentToLender(true)}>
            Mark sent to lender
          </Button>
        )}
        {condition.sentToLenderAt && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setSentToLender(false)} title="Take back the sent-to-lender mark and reopen the condition">
            Undo
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={pending}>
          Remove
        </Button>
      </div>
    </div>
  );
}

type KeyDateFlow = {
  category: "title" | "insurance";
  conditionText: string;
  step: "upload" | "received";
  /** Every condition in this category is now checked. */
  allDone: boolean;
};

const KEY_DATE_LABEL = { title: "Title", insurance: "Property insurance" } as const;

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// What happens after a title or insurance condition is checked off, without leaving this tab: offer to upload the
// document into Key Dates, then (once every condition in that category is checked) offer to update the Key Dates status.
function KeyDateFollowUp({
  dealId,
  flow,
  events,
  onAdvance,
  onClose,
}: {
  dealId: string;
  flow: KeyDateFlow | null;
  events: KeyDateEvent[];
  onAdvance: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!flow) return null;
  const label = KEY_DATE_LABEL[flow.category];
  const current = currentEventFor(flow.category, events.filter((e) => e.item === flow.category));

  function setStatus(status: "Received" | "Partially Received") {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("status", status);
        formData.set("eventDate", todayInputValue());
        await addKeyDateEvent(dealId, flow!.category, formData);
        toast.success(`${label} marked ${status.toLowerCase()} in Key Dates`);
        router.refresh();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update Key Dates.");
      }
    });
  }

  if (flow.step === "upload") {
    return (
      <Dialog open onOpenChange={(open) => !open && onAdvance()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload the {label.toLowerCase()} document?</DialogTitle>
            <DialogDescription>
              You checked off “{flow.conditionText}”. Add the document now and it is saved under {label} in Key Dates (and on the Documents tab), or skip it.
            </DialogDescription>
          </DialogHeader>
          <DealFileUploadForm dealId={dealId} category={flow.category} onDone={onAdvance} />
          <Button type="button" variant="ghost" onClick={onAdvance}>
            Skip for now
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Is {label.toLowerCase()} fully received?</DialogTitle>
          <DialogDescription>
            Every {label.toLowerCase()} condition is checked. Key Dates currently shows {label.toLowerCase()} as {current?.status ?? "Not Ordered"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button type="button" disabled={pending} onClick={() => setStatus("Received")}>
            Fully received
          </Button>
          {current?.status !== "Partially Received" && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setStatus("Partially Received")}>
              Partially received
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            No change
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConditionsTab({
  dealId,
  conditions,
  catalog,
  allProducts,
  existingNeedNames,
  keyDateEvents,
}: {
  dealId: string;
  conditions: DealCondition[];
  catalog: DealCatalogItem[];
  allProducts: { id: string; label: string }[];
  /** Names of the client needs already on the deal, so adding a duplicate is a visible choice. */
  existingNeedNames: string[];
  keyDateEvents: KeyDateEvent[];
}) {
  const router = useRouter();
  // Borrower conditions picked with the checkboxes, to act on together.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Conditions being turned into client needs, worked through in one Add Client Need window (empty = window closed).
  const [toCover, setToCover] = useState<ConditionToCover[]>([]);
  const [bulkPending, startBulk] = useTransition();
  const [flow, setFlow] = useState<KeyDateFlow | null>(null);
  const extract = extractConditionsFromEmail.bind(null, dealId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailText, setEmailText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await extract(await stageLargeFiles(formData, stageUploadChunk));
        setEmailText("");
        setFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast.success("Conditions extracted");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't extract conditions.";
        setError(message);
        toast.error(message);
      }
    });
  }

  const openCount = conditions.filter((c) => c.status === "open").length;
  const borrowerSelectable = conditions.filter((c) => c.category === "borrower" && c.status === "open");
  const pickedConditions = borrowerSelectable.filter((c) => selected.has(c.id));
  const pickedNeedingNeed = pickedConditions.filter(needsClientNeed);
  const pickedReady = pickedConditions.filter(canMarkSentToLender);
  const existingCounts = existingNeedNames.reduce<Record<string, number>>((acc, name) => {
    acc[name.toLowerCase()] = (acc[name.toLowerCase()] ?? 0) + 1;
    return acc;
  }, {});

  function setPicked(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  // Opens the Add Client Need window for these conditions, pre-filled one after another.
  function startCreating(ids: string[]) {
    const list = ids
      .map((id) => conditions.find((c) => c.id === id))
      .filter((c): c is DealCondition => !!c && needsClientNeed(c))
      .map((c) => ({
        id: c.id,
        label: c.description,
        itemName: c.suggestedNeedName ?? c.description,
        description: c.suggestedNeedDescription ?? "",
      }));
    if (!list.length) return;
    setToCover(list);
    setPicked(list.map((c) => c.id), false);
  }

  function sendPickedToLender() {
    const ids = pickedReady.map((c) => c.id);
    startBulk(async () => {
      try {
        const { updated } = await markConditionsSentToLender(dealId, ids, true);
        toast.success(`${updated} condition${updated === 1 ? "" : "s"} marked sent to the lender`);
        setPicked(ids, false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update those conditions.");
      }
    });
  }

  // Title and insurance conditions are checklist items. Checking one offers to put the document in Key Dates.
  function handleCleared(condition: DealCondition) {
    if (condition.category !== "title" && condition.category !== "insurance") return;
    const rest = conditions.filter((c) => c.category === condition.category && c.id !== condition.id);
    setFlow({
      category: condition.category,
      conditionText: condition.description,
      step: "upload",
      allDone: rest.every((c) => c.status === "cleared"),
    });
  }

  // After the upload step: ask about the Key Dates status only when the whole category is checked and not already Received.
  function advanceFlow() {
    setFlow((f) => {
      if (!f) return null;
      const status = currentEventFor(f.category, keyDateEvents.filter((e) => e.item === f.category))?.status;
      return f.allDone && status !== "Received" ? { ...f, step: "received" } : null;
    });
  }

  const visibleSections = CATEGORY_SECTIONS.filter(
    (section) => conditions.filter((c) => c.category === section.key).length > 0
  );
  // Tracks which sections are explicitly collapsed rather than which are
  // open, so a category that only just got its first condition (via a fresh
  // AI extraction) defaults to open like every other section always has.
  const [closedSections, setClosedSections] = useState<Set<string>>(() => new Set());
  const allExpanded = visibleSections.every((s) => !closedSections.has(s.key));

  function setSectionOpen(key: string, open: boolean) {
    setClosedSections((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card data-hi>
        <CardHeader>
          <CardTitle className="text-base">Extract Conditions from Lender Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Paste the lender&apos;s conditions/stipulations email, upload a conditional approval letter PDF, or
            both — AI will split it into individual conditions, sort title and insurance items into a simple
            checklist, and flag anything that&apos;s on the borrower for us to go collect.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              name="emailText"
              rows={8}
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder="Paste the conditions email here..."
            />
            <div className="space-y-1.5">
              <Label htmlFor="conditions-file">Or upload a conditional approval letter (PDF or image)</Label>
              <Input
                id="conditions-file"
                name="file"
                type="file"
                accept="application/pdf,image/*"
                ref={fileInputRef}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || (!emailText.trim() && !fileName)}>
              {pending ? "Extracting…" : "Extract Conditions"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {conditions.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {openCount === 0 ? "All conditions cleared." : `${openCount} open condition${openCount === 1 ? "" : "s"}.`}
        </p>
      )}

      {visibleSections.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setClosedSections(allExpanded ? new Set(visibleSections.map((s) => s.key)) : new Set())
            }
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}

      {visibleSections.map((section) => {
        const items = conditions.filter((c) => c.category === section.key);
        return (
          <CollapsibleSection
            key={section.key}
            title={section.title}
            description={section.description}
            open={!closedSections.has(section.key)}
            onOpenChange={(v) => setSectionOpen(section.key, v)}
          >
            <div className="space-y-2">
              {section.key === "borrower" && borrowerSelectable.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={pickedConditions.length === borrowerSelectable.length}
                      onCheckedChange={(v) => setPicked(borrowerSelectable.map((c) => c.id), v === true)}
                      aria-label="Select all open borrower conditions"
                    />
                    {pickedConditions.length ? `${pickedConditions.length} selected` : "Select all"}
                  </label>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={bulkPending || pickedNeedingNeed.length === 0}
                      onClick={() => startCreating(pickedNeedingNeed.map((c) => c.id))}
                      title="Opens the Add Client Need window for each selected condition that has none yet, one after another"
                    >
                      Create client needs ({pickedNeedingNeed.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={bulkPending || pickedReady.length === 0}
                      onClick={sendPickedToLender}
                      title="Only conditions whose client need has been accepted can be marked sent"
                    >
                      Mark sent to lender ({pickedReady.length})
                    </Button>
                  </div>
                </div>
              )}
              {items.map((condition) => (
                <ConditionRow
                  key={condition.id}
                  dealId={dealId}
                  condition={condition}
                  selected={selected.has(condition.id)}
                  onSelect={(on) => setPicked([condition.id], on)}
                  onAddNeed={(c) => startCreating([c.id])}
                  onCleared={handleCleared}
                />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}

      {conditions.length === 0 && (
        <p className="text-sm text-muted-foreground">No conditions extracted yet.</p>
      )}

      {toCover.length > 0 && (
        <AddClientNeedToDealDialog
          dealId={dealId}
          catalog={catalog}
          allProducts={allProducts}
          existingCounts={existingCounts}
          open
          onOpenChange={(open) => !open && setToCover([])}
          conditions={toCover}
          onNeedAdded={(conditionId, needId) => linkConditionToClientNeed(dealId, conditionId, needId)}
        />
      )}
      <KeyDateFollowUp dealId={dealId} flow={flow} events={keyDateEvents} onAdvance={advanceFlow} onClose={() => setFlow(null)} />
    </div>
  );
}
