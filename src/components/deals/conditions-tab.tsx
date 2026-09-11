"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  extractConditionsFromEmail,
  toggleConditionCleared,
  deleteCondition,
} from "@/server/actions/conditions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { CreateClientNeedFromConditionDialog } from "@/components/deals/create-client-need-from-condition-dialog";

export interface DealCondition {
  id: string;
  description: string;
  category: "title" | "insurance" | "borrower" | "other";
  status: "open" | "cleared";
  suggestedNeedName: string | null;
  suggestedNeedDescription: string | null;
  linkedClientNeedId: string | null;
}

const CATEGORY_SECTIONS: { key: DealCondition["category"]; title: string; description: string }[] = [
  { key: "borrower", title: "Borrower Conditions", description: "Ours to collect from the borrower." },
  { key: "title", title: "Title Conditions", description: "Title company's responsibility — tracked here." },
  { key: "insurance", title: "Insurance Conditions", description: "Tracked here — not something we chase the borrower for." },
  { key: "other", title: "Other Conditions", description: "Didn't clearly fit the categories above." },
];

function ConditionRow({
  dealId,
  condition,
}: {
  dealId: string;
  condition: DealCondition;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cleared = condition.status === "cleared";

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      await toggleConditionCleared(dealId, condition.id, checked);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm("Remove this condition?")) return;
    startTransition(async () => {
      await deleteCondition(dealId, condition.id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <label className="flex flex-1 items-start gap-2.5">
        <Checkbox checked={cleared} disabled={pending} onCheckedChange={(v) => handleToggle(v === true)} className="mt-0.5" />
        <span className={`text-sm ${cleared ? "text-muted-foreground line-through" : ""}`}>{condition.description}</span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        {condition.category === "borrower" &&
          (condition.linkedClientNeedId ? (
            <Badge variant="secondary">Added to Client Needs</Badge>
          ) : (
            <CreateClientNeedFromConditionDialog
              dealId={dealId}
              conditionId={condition.id}
              suggestedNeedName={condition.suggestedNeedName ?? condition.description}
              suggestedNeedDescription={condition.suggestedNeedDescription}
            />
          ))}
        <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={pending}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function ConditionsTab({ dealId, conditions }: { dealId: string; conditions: DealCondition[] }) {
  const router = useRouter();
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
        await extract(formData);
        setEmailText("");
        setFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't extract conditions.");
      }
    });
  }

  const openCount = conditions.filter((c) => c.status === "open").length;

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
      <Card>
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
              {items.map((condition) => (
                <ConditionRow key={condition.id} dealId={dealId} condition={condition} />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}

      {conditions.length === 0 && (
        <p className="text-sm text-muted-foreground">No conditions extracted yet.</p>
      )}
    </div>
  );
}
