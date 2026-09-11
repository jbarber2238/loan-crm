"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ClientNeedDialog } from "@/components/client-needs/client-need-dialog";
import { DeleteClientNeedButton } from "@/components/client-needs/delete-client-need-button";
import { CollapsibleSection } from "@/components/email-templates/collapsible-section";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CLIENT_NEED_CATEGORIES, CLIENT_NEED_TYPES, LOAN_CATEGORIES, labelFor } from "@/lib/labels";

export interface BrowsableClientNeed {
  id: string;
  itemName: string;
  description: string | null;
  category: string | null;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form";
  esignVendor: string | null;
  linkUrl: string | null;
  pandadocTemplateUuid: string | null;
  templateFileName: string | null;
  isCustom: boolean;
  isGlobal: boolean;
  loanCategories: string[];
  questions: { questionText: string }[];
  productCount: number;
}

// Describes which of the three generation layers (see clientNeeds.isGlobal
// in schema.ts) this item is on — shown so it's obvious at a glance whether
// something is universal, category-wide, or purely lender-specific.
function scopeLabel(item: BrowsableClientNeed): string {
  if (item.isGlobal) return "Every loan";
  if (item.loanCategories.length) {
    return item.loanCategories.map((c) => labelFor(LOAN_CATEGORIES, c)).join(", ");
  }
  return "Lender-specific only";
}

function categoryLabel(category: string | null): string {
  if (!category) return "Other";
  return labelFor(CLIENT_NEED_CATEGORIES, category) || "Other";
}

// Same card pattern as EmailTemplateCard: a bordered, chevron-triggered
// Collapsible per item, title in the flex-1 slot, a stable machine-ish value
// right-aligned in monospace (there the template key, here the need type),
// and full detail + actions revealed only once expanded.
function Row({
  item,
  allProducts,
  showCategory = false,
}: {
  item: BrowsableClientNeed;
  allProducts: { id: string; label: string }[];
  showCategory?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left">
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-sm font-medium">{item.itemName}</span>
        {item.isCustom && (
          <Badge variant="outline" className="text-[10px]">
            Custom
          </Badge>
        )}
        {showCategory && !item.isCustom && (
          <Badge variant="outline" className="text-[10px]">
            {categoryLabel(item.category)}
          </Badge>
        )}
        <code className="text-xs text-muted-foreground">{item.needType}</code>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t p-4 text-sm">
          {item.description && <p className="text-muted-foreground">{item.description}</p>}
          <p className="text-xs text-muted-foreground">
            {labelFor(CLIENT_NEED_TYPES, item.needType)} · {scopeLabel(item)} · used on {item.productCount} lender
            product{item.productCount === 1 ? "" : "s"} directly
          </p>
          {item.needType === "esign" && item.esignVendor && (
            <p className="text-xs text-muted-foreground">Via {item.esignVendor}</p>
          )}
          {item.needType === "document_upload" && item.templateFileName && (
            <p className="text-xs text-muted-foreground">Template: {item.templateFileName}</p>
          )}
          {item.needType === "link" && item.linkUrl && (
            <p className="truncate text-xs text-muted-foreground">Link: {item.linkUrl}</p>
          )}
          {item.needType === "pandadoc_form" && item.pandadocTemplateUuid && (
            <p className="truncate text-xs text-muted-foreground">PandaDoc template: {item.pandadocTemplateUuid}</p>
          )}
          {item.needType === "questionnaire" && item.questions.length > 0 && (
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {item.questions.map((q, i) => (
                <li key={i}>{q.questionText}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 border-t pt-3">
            <ClientNeedDialog
              clientNeed={{
                id: item.id,
                itemName: item.itemName,
                description: item.description,
                category: item.category,
                needType: item.needType,
                esignVendor: item.esignVendor,
                linkUrl: item.linkUrl,
                pandadocTemplateUuid: item.pandadocTemplateUuid,
                templateFileName: item.templateFileName,
                isCustom: item.isCustom,
                isGlobal: item.isGlobal,
                loanCategories: item.loanCategories,
                questions: item.questions,
              }}
              allProducts={allProducts}
              trigger={
                <Button size="sm" variant="outline">
                  Edit
                </Button>
              }
            />
            <DeleteClientNeedButton clientNeedId={item.id} itemName={item.itemName} usageCount={item.productCount} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ClientNeedsBrowser({
  items,
  allProducts,
}: {
  items: BrowsableClientNeed[];
  allProducts: { id: string; label: string }[];
}) {
  const [search, setSearch] = useState("");

  const standard = items.filter((i) => !i.isCustom);
  const custom = items.filter((i) => i.isCustom);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return items.filter(
      (i) => i.itemName.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)
    );
  }, [search, items]);

  const standardByCategory = useMemo(() => {
    const groups = new Map<string, BrowsableClientNeed[]>();
    for (const item of standard) {
      const key = item.category ?? "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return CLIENT_NEED_CATEGORIES.map((c) => ({ ...c, items: groups.get(c.value) ?? [] })).filter(
      (g) => g.items.length > 0
    );
  }, [standard]);

  // Category groups start closed and "Custom" starts open, matching the
  // defaultOpen values this page always used — Collapse/Expand All just
  // overrides all of them at once from here on.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["custom"]));
  const allGroupKeys = useMemo(() => ["custom", ...standardByCategory.map((g) => g.value)], [standardByCategory]);

  function setGroupOpen(key: string, open: boolean) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // One toggle, not two buttons: once everything's open it offers to
  // collapse; otherwise (including a mixed state) it offers to expand.
  const allExpanded = allGroupKeys.length > 0 && allGroupKeys.every((k) => openGroups.has(k));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search client needs by name or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ClientNeedDialog
          allProducts={allProducts}
          trigger={<Button size="sm" className="shrink-0">+ New Custom Need</Button>}
        />
      </div>

      {searchResults ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
          </p>
          {searchResults.map((item) => (
            <Row key={item.id} item={item} allProducts={allProducts} showCategory />
          ))}
          {searchResults.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpenGroups(allExpanded ? new Set() : new Set(allGroupKeys))}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Standard</h2>
              <p className="text-xs text-muted-foreground">Curated by us, shown to everyone building a checklist.</p>
            </div>

            {standardByCategory.map((group) => (
              <CollapsibleSection
                key={group.value}
                title={group.label}
                open={openGroups.has(group.value)}
                onOpenChange={(v) => setGroupOpen(group.value, v)}
              >
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <Row key={item.id} item={item} allProducts={allProducts} />
                  ))}
                </div>
              </CollapsibleSection>
            ))}
            {standard.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          </div>

          <CollapsibleSection
            title="Custom"
            description="Added ad hoc by processors while building out a product's checklist — still reusable elsewhere."
            open={openGroups.has("custom")}
            onOpenChange={(v) => setGroupOpen("custom", v)}
          >
            <div className="space-y-2">
              {custom.map((item) => (
                <Row key={item.id} item={item} allProducts={allProducts} />
              ))}
              {custom.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
