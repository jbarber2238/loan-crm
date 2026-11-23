"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addClientNeedToDeal, addDocumentForSignatureToDeal, addStagedCatalogNeedsToDeal } from "@/server/actions/client-needs";
import { ClientNeedForm } from "@/components/client-needs/client-need-form";
import { LenderTagBadge } from "@/components/client-needs/lender-tag-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CLIENT_NEED_TYPES, labelFor } from "@/lib/labels";

export interface DealCatalogItem {
  id: string;
  itemName: string;
  /** The catalog's borrower instructions, which the staging list starts from and the processor can reword. */
  description?: string | null;
  /** For "link" needs: where the borrower is sent. The staging list lets the processor swap in this lender's link. */
  linkUrl?: string | null;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form" | "custom_form";
  isCustom: boolean;
  /** Internal lender tag's name, when the need is one lender's form. Staff-only. */
  lenderTagName?: string | null;
}

// One entry in the "Ready to add" list. Catalog entries can repeat (three Operating Agreements); custom entries hold the
// filled-in custom-need form until everything is added together.
type Staged = (
  | { key: number; kind: "catalog"; catalogId: string; itemName: string; description: string; linkUrl: string; needType: DealCatalogItem["needType"]; isCustom: boolean }
  | { key: number; kind: "custom"; formData: FormData; itemName: string; description: string; linkUrl: string; needType: DealCatalogItem["needType"] }
) & {
  /** The lender condition this need is for, when the dialog was opened from the Conditions tab. */
  conditionId?: string;
};

/** A lender condition the dialog is working through: its pre-filled custom need, and how to refer to it. */
export interface ConditionToCover {
  id: string;
  label: string;
  itemName: string;
  description: string;
}

const isWebLink = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());

export function AddClientNeedToDealDialog({
  dealId,
  catalog,
  allProducts,
  existingCounts = {},
  open,
  onOpenChange,
  conditions,
  onNeedAdded,
}: {
  dealId: string;
  catalog: DealCatalogItem[];
  allProducts: { id: string; label: string }[];
  /** itemName (lowercased) → how many are already on this deal — shown so adding a deliberate duplicate (e.g. a 2nd Operating Agreement) is an informed choice, never a blocked one. */
  existingCounts?: Record<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opened from lender conditions: works through them one at a time. The Custom Need form loads pre-filled for the
   * first condition; adding a need to the list (custom or standard) moves on to the next. Nothing is created until
   * "Add to deal", which then reports each new need with the condition it was for.
   */
  conditions?: ConditionToCover[];
  onNeedAdded?: (conditionId: string, needId: string) => Promise<void> | void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const nextKey = useRef(1);
  // Conditions the processor chose to skip; the current one is the first not yet covered by a staged need or skipped.
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const covered = new Set(staged.map((s) => s.conditionId).filter((id): id is string => !!id));
  const queue = conditions ?? [];
  const current = queue.find((c) => !covered.has(c.id) && !skipped.has(c.id));
  const currentIndex = current ? queue.indexOf(current) : -1;
  // Bumped after each custom need is staged so the form starts blank for the next one.
  const [customFormVersion, setCustomFormVersion] = useState(0);

  const [signPending, startSignTransition] = useTransition();
  const [signError, setSignError] = useState<string | null>(null);

  const sorted = [...catalog].sort((a, b) => a.itemName.localeCompare(b.itemName));
  const stagedCounts = staged.reduce<Record<string, number>>((acc, s) => {
    if (s.kind === "catalog") acc[s.catalogId] = (acc[s.catalogId] ?? 0) + 1;
    return acc;
  }, {});
  const hasBlankName = staged.some((s) => !s.itemName.trim());
  const hasBlankLink = staged.some((s) => s.needType === "link" && !isWebLink(s.linkUrl));

  function stageCatalog(item: DealCatalogItem) {
    setAddError(null);
    setStaged((prev) => [
      ...prev,
      { key: nextKey.current++, kind: "catalog", catalogId: item.id, itemName: item.itemName, description: item.description ?? "", linkUrl: item.linkUrl ?? "", needType: item.needType, isCustom: item.isCustom, conditionId: current?.id },
    ]);
  }

  function stageCustom(formData: FormData) {
    setAddError(null);
    const type = formData.get("needType");
    setStaged((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        kind: "custom",
        formData,
        itemName: String(formData.get("itemName") ?? ""),
        description: String(formData.get("description") ?? ""),
        linkUrl: String(formData.get("linkUrl") ?? ""),
        needType: (typeof type === "string" ? type : "document_upload") as DealCatalogItem["needType"],
        conditionId: current?.id,
      },
    ]);
    setCustomFormVersion((v) => v + 1);
    const next = queue.find((c) => c.id !== current?.id && !covered.has(c.id) && !skipped.has(c.id));
    toast.success(next ? "Added to the list. On to the next condition." : "Added to the list. Add another, or use Add to deal when you're ready.");
  }

  function patchStaged(key: number, patch: Partial<Pick<Staged, "itemName" | "description" | "linkUrl">>) {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addAll() {
    setAddError(null);
    startAdding(async () => {
      let remaining = staged;
      let added = 0;
      // Ties a new need to the condition it was staged for, as soon as it exists, even if a later one in the batch fails.
      async function report(conditionId: string | undefined, needId: string | undefined) {
        if (!conditionId || !needId) return;
        await onNeedAdded?.(conditionId, needId);
      }
      try {
        // In the order they were staged; neighbouring catalog entries go up together.
        while (remaining.length) {
          const first = remaining[0];
          if (first.kind === "catalog") {
            const run: Extract<Staged, { kind: "catalog" }>[] = [];
            for (const s of remaining) {
              if (s.kind !== "catalog") break;
              run.push(s);
            }
            const createdCatalog = await addStagedCatalogNeedsToDeal(
              dealId,
              run.map((r) => ({
                catalogId: r.catalogId,
                itemName: r.itemName,
                description: r.description.trim() || null,
                linkUrl: r.needType === "link" ? r.linkUrl.trim() : null,
              })),
            );
            for (let i = 0; i < run.length; i++) await report(run[i].conditionId, createdCatalog[i]?.id);
            remaining = remaining.slice(run.length);
            added += run.length;
          } else {
            first.formData.set("itemName", first.itemName.trim());
            first.formData.set("description", first.description.trim());
            if (first.needType === "link") first.formData.set("linkUrl", first.linkUrl.trim());
            const createdCustom = await addClientNeedToDeal(dealId, first.formData);
            await report(first.conditionId, createdCustom?.id);
            remaining = remaining.slice(1);
            added += 1;
          }
        }
        setStaged([]);
        onOpenChange(false);
        toast.success(`${added} need${added === 1 ? "" : "s"} added`);
        router.refresh();
      } catch (err) {
        // Whatever went in stays added; only the ones that didn't are left in the list to fix and retry.
        setStaged(remaining);
        const message = err instanceof Error ? err.message : "Couldn't add those needs.";
        setAddError(added ? `${added} added. The rest didn't go through: ${message}` : message);
        toast.error(message);
        if (added) router.refresh();
      }
    });
  }

  function handleSignatureAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignError(null);
    const formData = new FormData(e.currentTarget);
    startSignTransition(async () => {
      try {
        await addDocumentForSignatureToDeal(dealId, formData);
        onOpenChange(false);
        toast.success("Added. Use Send to Borrower to let them know it's ready to sign.");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send that document.";
        setSignError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add Client Need</DialogTitle>
          <DialogDescription>
            Pick standard needs (the same one as many times as you need) and build custom ones. They collect in the list on the left, where you can
            reword them, then add them all at once.
          </DialogDescription>
        </DialogHeader>

        {queue.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {current ? (
              <>
                <span className="min-w-0">
                  <b>
                    {queue.length > 1 ? `Condition ${currentIndex + 1} of ${queue.length}: ` : "For the condition: "}
                  </b>
                  {current.label}
                </span>
                {queue.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSkipped((prev) => new Set(prev).add(current.id))}>
                    Skip this one
                  </Button>
                )}
              </>
            ) : (
              <span>
                {queue.length > 1 ? `All ${queue.length} conditions are in the list.` : "The condition is in the list."} Review them, then use Add to deal.
              </span>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-label="Ready to add" className="flex min-h-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3 max-md:order-2">
            <h3 className="text-sm font-semibold">Ready to add{staged.length ? ` (${staged.length})` : ""}</h3>
            <div className="max-h-[52vh] min-h-24 space-y-2 overflow-y-auto pr-1">
              {staged.length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  Nothing yet. Click a need on the right to put it here. Click it again for a second copy.
                </p>
              )}
              {staged.map((s) => (
                <div key={s.key} className="space-y-1.5 rounded-md border bg-background p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      aria-label="Need title"
                      value={s.itemName}
                      onChange={(e) => patchStaged(s.key, { itemName: e.target.value })}
                      aria-invalid={!s.itemName.trim()}
                      className="h-8 flex-1 text-sm font-medium"
                    />
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${s.itemName || "this need"}`} title="Remove from the list" onClick={() => setStaged((prev) => prev.filter((x) => x.key !== s.key))}>
                      <X className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    aria-label="Instructions for the borrower"
                    rows={2}
                    placeholder="Instructions for the borrower (optional)"
                    value={s.description}
                    onChange={(e) => patchStaged(s.key, { description: e.target.value })}
                    className="min-h-0 text-sm"
                  />
                  {s.needType === "link" && (
                    <Input
                      aria-label="Link the borrower will open"
                      type="url"
                      placeholder="Link for the borrower, https://…"
                      value={s.linkUrl}
                      onChange={(e) => patchStaged(s.key, { linkUrl: e.target.value })}
                      aria-invalid={!isWebLink(s.linkUrl)}
                      className="h-8 text-sm"
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    {(s.kind === "custom" || s.isCustom) && (
                      <Badge variant="secondary" className="text-[10px]">
                        Custom
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{labelFor(CLIENT_NEED_TYPES, s.needType)}</span>
                  </div>
                  {s.conditionId && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">For: {queue.find((c) => c.id === s.conditionId)?.label}</p>
                  )}
                </div>
              ))}
            </div>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
            {hasBlankName && <p className="text-xs text-destructive">Every need needs a title.</p>}
            {hasBlankLink && <p className="text-xs text-destructive">Add the link for each link-type need (it has to start with https://).</p>}
            <Button type="button" className="w-full" disabled={adding || staged.length === 0 || hasBlankName || hasBlankLink} onClick={addAll}>
              {adding ? "Adding…" : staged.length ? `Add ${staged.length} to deal` : "Add to deal"}
            </Button>
          </section>

          <Tabs defaultValue={queue.length ? "custom" : "list"} className="min-w-0 max-md:order-1">
            <TabsList>
              <TabsTrigger value="list">Select from List</TabsTrigger>
              <TabsTrigger value="custom">Custom Need</TabsTrigger>
              <TabsTrigger value="sign">Document to Sign</TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-3 pt-2">
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-md border p-2">
                {sorted.map((item) => {
                  const matches = `${item.itemName} ${item.lenderTagName ?? ""}`.toLowerCase().includes(search.toLowerCase());
                  const existingCount = existingCounts[item.itemName.toLowerCase()] ?? 0;
                  const stagedCount = stagedCounts[item.id] ?? 0;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => stageCatalog(item)}
                      title="Add to the list on the left. Click again for another copy."
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50 ${matches ? "" : "hidden"}`}
                    >
                      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{item.itemName}</span>
                      {item.lenderTagName && <LenderTagBadge name={item.lenderTagName} />}
                      {stagedCount > 0 && (
                        <Badge variant="default" className="text-[10px]">
                          In list{stagedCount > 1 ? ` ×${stagedCount}` : ""}
                        </Badge>
                      )}
                      {existingCount > 0 && (
                        <Badge variant="outline" className="text-[10px]" title="Already on this deal. Adding it again gives you another one, e.g. a 2nd Operating Agreement for a 2nd entity">
                          Already added{existingCount > 1 ? ` ×${existingCount}` : ""}
                        </Badge>
                      )}
                      {item.isCustom && (
                        <Badge variant="secondary" className="text-[10px]">
                          Custom
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{labelFor(CLIENT_NEED_TYPES, item.needType)}</span>
                    </button>
                  );
                })}
                {sorted.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">No client needs in the catalog yet.</p>}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="max-h-[60vh] overflow-y-auto pt-2 pr-1">
              <ClientNeedForm
                key={`${customFormVersion}-${current?.id ?? "none"}`}
                formId="deal-custom-need"
                // Pre-filled from the condition being worked on; blank once every condition has its need.
                initialValues={current ? { itemName: current.itemName, description: current.description } : undefined}
                allProducts={allProducts}
                onSubmit={stageCustom}
                submitLabel="Add to list"
                pending={false}
                error={null}
              />
            </TabsContent>
            <TabsContent value="sign" className="pt-2">
            <form onSubmit={handleSignatureAdd} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Upload a simple PDF that only needs the borrower&apos;s signature and date, like a letter of explanation. We send it through PandaDoc.
                After this, use Send to Borrower to tell them it&apos;s ready.
              </p>
              <ul className="list-disc space-y-1 rounded-md border bg-muted/40 py-2.5 pr-3 pl-7 text-sm">
                <li>
                  <b>One signer only.</b> It goes to the borrower on this deal and no one else.
                </li>
                <li>
                  <b>We add the signature page.</b> A page with a signature and date line is added at the end, so leave the signature and date
                  off your PDF.
                </li>
                <li>Nothing else on the document can be filled in, such as initials, checkboxes or blanks. Save it as a PDF first if it&apos;s a Word file.</li>
              </ul>
              <div className="space-y-1.5">
                <Label htmlFor="sign-file">PDF to sign</Label>
                <Input id="sign-file" name="file" type="file" accept="application/pdf,.pdf" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sign-name">Name shown to the borrower (optional)</Label>
                <Input id="sign-name" name="itemName" placeholder="e.g. Letter of Explanation" />
              </div>
              {signError && <p className="text-sm text-destructive">{signError}</p>}
              <Button type="submit" className="w-full" disabled={signPending}>
                {signPending ? "Sending to PandaDoc…" : "Add and send to PandaDoc"}
              </Button>
            </form>
          </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
