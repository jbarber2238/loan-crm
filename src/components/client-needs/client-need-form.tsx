"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { draftClientNeedWithAI, type ClientNeedDraft } from "@/server/ai/client-need-draft";
import { getClientNeedProductIds, getLenderTagOptions } from "@/server/actions/client-need-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLIENT_NEED_CATEGORIES, CLIENT_NEED_TYPES, LOAN_CATEGORIES } from "@/lib/labels";
import { CUSTOM_NEED_FORM_OPTIONS } from "@/lib/custom-need-forms/registry";
import { LenderTagBadge } from "@/components/client-needs/lender-tag-badge";
import { findLenderMention, replaceLenderInText, stripLenderFromTitle } from "@/lib/lender-mention";

type TaggedLender = NonNullable<ClientNeedDraft["lender"]>;
// The answer to "which of this lender's products get the need?", asked whenever a need is tagged for a lender.
type ProductAssignChoice = "all" | "certain" | "none";

type NeedType = "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form" | "custom_form";

export interface ExistingClientNeed {
  id: string;
  itemName: string;
  description: string | null;
  category: string | null;
  needType: NeedType;
  esignVendor: string | null;
  linkUrl: string | null;
  pandadocTemplateUuid: string | null;
  customFormKey: string | null;
  templateFileName: string | null;
  isCustom: boolean;
  isGlobal: boolean;
  loanCategories: string[];
  // Internal lender tag (never shown to the borrower). Absent on a deal's own copy.
  lenderTagId?: string | null;
  // `id` is the deal-level answer row, set only when editing a need on a deal so a reworded question keeps its place.
  questions: { id?: string; questionText: string; required: boolean }[];
  // Where the attached file is served from — the catalog's route by default, a deal need's own when editing on a deal.
  templateFileUrl?: string;
}

export function ClientNeedForm({
  formId,
  clientNeed,
  allProducts = [],
  onSubmit,
  submitLabel,
  pending,
  error,
  scope = "catalog",
  initialValues,
}: {
  formId: string;
  clientNeed?: ExistingClientNeed;
  allProducts?: { id: string; label: string }[];
  onSubmit: (formData: FormData) => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  // "deal": editing one deal's own copy of a custom need. Everything about what the need IS stays (name, instructions,
  // type and the per-type settings); the options that decide where the shared catalog uses it (standard, applies to
  // loans / lender products, category) and the AI starter draft are left out, because a deal edit never touches the catalog.
  scope?: "catalog" | "deal";
  // Starts a brand-new need with the name and instructions already typed in (e.g. from a lender condition). Ignored when editing.
  initialValues?: { itemName: string; description: string };
}) {
  const isEdit = !!clientNeed;
  const isDeal = scope === "deal";

  const [itemName, setItemName] = useState(clientNeed?.itemName ?? initialValues?.itemName ?? "");
  const [description, setDescription] = useState(clientNeed?.description ?? initialValues?.description ?? "");
  const [category, setCategory] = useState(clientNeed?.category ?? "other");
  const [isStandard, setIsStandard] = useState(clientNeed?.isCustom === false);
  const [isGlobal, setIsGlobal] = useState(clientNeed?.isGlobal ?? false);
  const [loanCategories, setLoanCategories] = useState<string[]>(clientNeed?.loanCategories ?? []);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productIdsLoading, setProductIdsLoading] = useState(isEdit && !isDeal);
  const [productSearch, setProductSearch] = useState("");
  const [lenderTagId, setLenderTagId] = useState<string>(clientNeed?.lenderTagId ?? "none");
  const [lenderOptions, setLenderOptions] = useState<TaggedLender[] | null>(null);
  const [needType, setNeedType] = useState<NeedType>(clientNeed?.needType ?? "document_upload");
  const [esignVendor, setEsignVendor] = useState(clientNeed?.esignVendor ?? "");
  const [linkUrl, setLinkUrl] = useState(clientNeed?.linkUrl ?? "");
  const [pandadocTemplateUuid, setPandadocTemplateUuid] = useState(clientNeed?.pandadocTemplateUuid ?? "");
  const [customFormKey, setCustomFormKey] = useState(clientNeed?.customFormKey ?? "");
  const [questions, setQuestions] = useState<{ id?: string; text: string; required: boolean }[]>(
    clientNeed?.questions.length
      ? clientNeed.questions.map((q) => ({ id: q.id, text: q.questionText, required: q.required }))
      : [{ text: "", required: false }]
  );
  const [removeFile, setRemoveFile] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPending, startAiTransition] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);
  // The lender the last AI draft found in the request. It is tagged straight away.
  const [aiLender, setAiLender] = useState<TaggedLender | null>(null);
  // Which of the tagged lender's products get the need is asked, never assumed. Null until it is answered.
  const [assignChoice, setAssignChoice] = useState<ProductAssignChoice | null>(null);
  const lenderQuestionRef = useRef<HTMLDivElement>(null);
  // A lender the request named that isn't in the Lenders list, so there was nothing to tag.
  const [unlistedLender, setUnlistedLender] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetched lazily (not passed as a prop) so a save from any page — a
  // specific lender's product view or the shared catalog — always starts
  // from the true, complete cross-lender attachment list and never
  // silently drops one this page's own data happened not to include.
  useEffect(() => {
    if (!clientNeed || isDeal) return;
    let cancelled = false;
    getClientNeedProductIds(clientNeed.id).then((ids) => {
      if (!cancelled) {
        setProductIds(ids);
        setProductIdsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // Only clientNeed.id ever changes across a form instance's lifetime —
    // each edit dialog is a fresh mount, so this fires exactly once per item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientNeed?.id]);

  // The lender list for the internal tag, fetched when the form opens so no page has to pass it down.
  useEffect(() => {
    if (isDeal) return;
    let cancelled = false;
    getLenderTagOptions()
      .then((rows) => {
        if (!cancelled) setLenderOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setLenderOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isDeal]);

  function handleGenerate() {
    setAiError(null);
    startAiTransition(async () => {
      try {
        const draft = await draftClientNeedWithAI(aiPrompt);
        setItemName(draft.itemName);
        setDescription(draft.description);
        setNeedType(draft.needType);
        setEsignVendor(draft.esignVendor ?? "");
        setQuestions(
          draft.questions.length ? draft.questions.map((text) => ({ text, required: false })) : [{ text: "", required: false }]
        );
        // A lender picked up by an earlier draft is undone when the new draft names a different one, or none.
        if (draft.lender) changeLenderTag(draft.lender.id);
        else if (aiLender && lenderTagId === aiLender.id) changeLenderTag("none");
        setAiLender(draft.lender);
        setUnlistedLender(draft.unlistedLenderName);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Couldn't generate a draft.");
      }
    });
  }

  // The lender this need is tagged for, with its products. The AI's own answer covers the moment before the list loads.
  const taggedLender: TaggedLender | null =
    lenderTagId === "none"
      ? null
      : (lenderOptions?.find((l) => l.id === lenderTagId) ?? (aiLender?.id === lenderTagId ? aiLender : null));
  const taggedProductIds = taggedLender ? taggedLender.products.map((p) => p.id) : [];
  const taggedAssignedCount = taggedProductIds.filter((id) => productIds.includes(id)).length;

  function changeLenderTag(nextId: string) {
    if (nextId === lenderTagId) return;
    // Products handed out through the question belong to the lender that was tagged, so they go when the tag does.
    if (assignChoice !== null && taggedProductIds.length) {
      setProductIds((prev) => prev.filter((id) => !taggedProductIds.includes(id)));
    }
    setLenderTagId(nextId);
    setAssignChoice(null);
  }

  function chooseProductAssignment(choice: ProductAssignChoice) {
    if (!taggedLender) return;
    setAssignChoice(choice);
    if (choice === "all") {
      setProductIds((prev) => [...new Set([...prev, ...taggedProductIds])]);
    } else if (choice === "none") {
      setProductIds((prev) => prev.filter((id) => !taggedProductIds.includes(id)));
    }
    // A need tied to one lender's products can't also be "every loan" (that setting ignores the product list).
    if (choice !== "none") setIsGlobal(false);
  }

  // A lender named in what the borrower reads (typed by hand, with no AI draft to catch it).
  const namedLender =
    !isDeal && lenderOptions
      ? findLenderMention([itemName, description, ...questions.map((q) => q.text)].join("\n"), lenderOptions)
      : null;

  function moveLenderNameToTag(lender: TaggedLender) {
    setItemName((prev) => stripLenderFromTitle(prev, lender.name) || prev);
    setDescription((prev) => replaceLenderInText(prev, lender.name));
    setQuestions((prev) => prev.map((q) => ({ ...q, text: replaceLenderInText(q.text, lender.name) })));
    changeLenderTag(lender.id);
  }

  // Once a draft tags a lender, bring the product question into view so it isn't missed further down the form.
  useEffect(() => {
    if (aiLender) lenderQuestionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [aiLender]);

  const visibleProducts = allProducts.filter((p) => p.label.toLowerCase().includes(productSearch.toLowerCase()));
  // Checked products with no checkbox on screen (hidden by the search box, or on a page that didn't load the product
  // list) still have to be sent with the form, or saving would quietly drop them.
  const visibleProductIds = new Set(visibleProducts.map((p) => p.id));
  const unseenProductIds = productIdsLoading ? [] : productIds.filter((id) => !visibleProductIds.has(id));
  // What the question's buttons show as picked: the answer given, or what the saved product list already says.
  const shownChoice: ProductAssignChoice | null =
    assignChoice ??
    (taggedAssignedCount === 0 ? null : taggedAssignedCount === taggedProductIds.length ? "all" : "certain");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <div className="space-y-4">
      {!isEdit && !isDeal && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor={`${formId}-aiPrompt`} className="flex items-center gap-1.5 text-sm">
            <Sparkles className="size-3.5" />
            Draft with AI
          </Label>
          <div className="flex gap-2">
            <Input
              id={`${formId}-aiPrompt`}
              placeholder="e.g. proof of insurance for the subject property"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <Button type="button" variant="secondary" disabled={aiPending || !aiPrompt.trim()} onClick={handleGenerate}>
              {aiPending ? "Drafting…" : "Generate"}
            </Button>
          </div>
          {aiError && <p className="text-sm text-destructive">{aiError}</p>}
          {unlistedLender && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm">
              &ldquo;{unlistedLender}&rdquo; isn&apos;t in your Lenders list, so this wasn&apos;t tagged. Its name was still kept
              out of what the borrower reads. Add the lender first, or pick a lender tag below.
            </p>
          )}
          {aiLender && lenderTagId === aiLender.id && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <LenderTagBadge name={aiLender.name} />
              <span>
                Tagged for {aiLender.name}, and its name was kept out of what the borrower reads. Pick which of its
                products get this need, just below.
              </span>
            </div>
          )}
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-itemName`}>Item name</Label>
          <Input
            id={`${formId}-itemName`}
            name="itemName"
            required
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Proof of Insurance"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-description`}>Instructions for the borrower</Label>
          <Textarea
            id={`${formId}-description`}
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional detail shown to the borrower"
          />
        </div>

        {namedLender && (
          <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <p>
              This names <span className="font-medium">{namedLender.name}</span>, and the borrower reads the item name
              and instructions.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => moveLenderNameToTag(namedLender)}>
              Tag {namedLender.name} and take the name out
            </Button>
          </div>
        )}

        {!isDeal && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-lenderTag`}>Lender tag (internal only)</Label>
            <Select name="lenderTagId" value={lenderTagId} onValueChange={changeLenderTag}>
              <SelectTrigger id={`${formId}-lenderTag`} className="w-full">
                <SelectValue placeholder="No specific lender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific lender</SelectItem>
                {(lenderOptions ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
                {/* Keeps the saved lender selected while the list is still loading. */}
                {lenderOptions === null && lenderTagId !== "none" && <SelectItem value={lenderTagId}>Loading…</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Marks this as one lender&apos;s form so your team can find it by lender. The borrower never sees this, so
              keep the lender&apos;s name out of the item name above.
            </p>
            {taggedLender && !productIdsLoading && (
              <div ref={lenderQuestionRef} className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                {taggedLender.products.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {taggedLender.name} has no active products yet, so there is nothing to assign this to.
                  </p>
                ) : (
                  <>
                    <p className="font-medium">Which {taggedLender.name} products should get this need?</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={shownChoice === "all" ? "default" : "outline"}
                        onClick={() => chooseProductAssignment("all")}
                      >
                        {taggedLender.products.length === 1
                          ? `Their one product (${taggedLender.products[0].name})`
                          : `All ${taggedLender.products.length} products`}
                      </Button>
                      {taggedLender.products.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant={shownChoice === "certain" ? "default" : "outline"}
                          onClick={() => chooseProductAssignment("certain")}
                        >
                          Just certain products
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={assignChoice === "none" ? "default" : "outline"}
                        onClick={() => chooseProductAssignment("none")}
                      >
                        None for now
                      </Button>
                    </div>
                    {shownChoice === "certain" && (
                      <div className="space-y-0.5 rounded-md border bg-background p-2">
                        {taggedLender.products.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/50">
                            <Checkbox
                              checked={productIds.includes(p.id)}
                              onCheckedChange={(v) => {
                                setProductIds((prev) => (v === true ? [...new Set([...prev, p.id])] : prev.filter((x) => x !== p.id)));
                                setAssignChoice("certain");
                                if (v === true) setIsGlobal(false);
                              }}
                            />
                            {p.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {taggedAssignedCount === 0
                        ? shownChoice === null
                          ? `Until you pick, it isn't assigned to any ${taggedLender.name} product.`
                          : `Not assigned to any ${taggedLender.name} product. You can still add it to a deal by hand.`
                        : taggedAssignedCount === taggedLender.products.length
                          ? `Deals on any ${taggedLender.name} product will get this need.`
                          : `Deals on the ${taggedAssignedCount} ${taggedLender.name} product${taggedAssignedCount === 1 ? "" : "s"} you checked will get this need.`}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {!isDeal && (
          <>
        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <Checkbox
            name="isStandard"
            checked={isStandard}
            onCheckedChange={(v) => setIsStandard(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Standard client need</span>
            <span className="block text-xs text-muted-foreground">
              Available everywhere, not just here. Leave unchecked for a one-off — you can always promote it to
              standard later if it turns out to be needed across more than one lender.
            </span>
          </span>
        </label>

        <div className="space-y-3 rounded-md border p-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              name="isGlobal"
              checked={isGlobal}
              onCheckedChange={(v) => setIsGlobal(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Applies to every loan</span>
              <span className="block text-xs text-muted-foreground">
                Every deal gets this regardless of loan type or lender (e.g. Driver&apos;s License).
              </span>
            </span>
          </label>

          {!isGlobal && (
            <div className="space-y-1.5 pl-6">
              <Label className="text-xs text-muted-foreground">
                Or, applies to every loan of these types (any lender)
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {LOAN_CATEGORIES.map((c) => (
                  <label key={c.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      name="loanCategories"
                      value={c.value}
                      checked={loanCategories.includes(c.value)}
                      onCheckedChange={(v) =>
                        setLoanCategories((prev) =>
                          v === true ? [...prev, c.value] : prev.filter((x) => x !== c.value)
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave all unchecked if this only applies to one specific lender&apos;s product below.
              </p>
            </div>
          )}

          {!isGlobal && (
            <div className="space-y-1.5 pl-6">
              <Label className="text-xs text-muted-foreground">
                Or, applies to specific lender products — check as many as you need
              </Label>
              {productIdsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <Input
                    placeholder="Search lender or loan type…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border p-2">
                    {visibleProducts.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/50"
                        >
                          <Checkbox
                            name="productIds"
                            value={p.id}
                            checked={productIds.includes(p.id)}
                            onCheckedChange={(v) =>
                              setProductIds((prev) =>
                                v === true ? [...prev, p.id] : prev.filter((x) => x !== p.id)
                              )
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    {visibleProducts.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches.</p>
                    )}
                  </div>
                  {unseenProductIds.map((id) => (
                    <input key={id} type="hidden" name="productIds" value={id} />
                  ))}
                  {productIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{productIds.length} selected</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

          </>
        )}

        {!isDeal && (
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-category`}>Category</Label>
          <Select name="category" value={category} onValueChange={setCategory}>
            <SelectTrigger id={`${formId}-category`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_NEED_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-needType`}>Type</Label>
          <Select name="needType" value={needType} onValueChange={(v) => setNeedType(v as NeedType)}>
            <SelectTrigger id={`${formId}-needType`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* E-Sign is retired as a choice (signing goes through PandaDoc); it only shows for an existing need that already uses it. */}
              {CLIENT_NEED_TYPES.filter((t) => t.value !== "esign" || clientNeed?.needType === "esign").map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needType === "document_upload" && (
          <div className="space-y-1.5 rounded-md bg-muted/40 p-3">
            <Label htmlFor={`${formId}-templateFile`}>Attach a blank/fillable file (optional)</Label>
            <p className="text-xs text-muted-foreground">
              E.g. a lender application PDF. The borrower will get a link to download this, fill it in, and upload it
              back.
            </p>
            {isEdit && clientNeed?.templateFileName && !removeFile && (
              <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm">
                <a
                  href={clientNeed.templateFileUrl ?? `/api/client-needs/${clientNeed.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {clientNeed.templateFileName}
                </a>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRemoveFile(true)}>
                  Remove
                </Button>
              </div>
            )}
            {removeFile && <input type="hidden" name="removeTemplateFile" value="on" />}
            <Input ref={fileInputRef} id={`${formId}-templateFile`} name="templateFile" type="file" />
          </div>
        )}

        {needType === "esign" && !isDeal && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-esignVendor`}>E-sign vendor (optional)</Label>
            <Input
              id={`${formId}-esignVendor`}
              name="esignVendor"
              value={esignVendor}
              onChange={(e) => setEsignVendor(e.target.value)}
              placeholder="PandaDoc, DocuSign, etc."
            />
            <p className="text-xs text-muted-foreground">
              No e-sign integration yet — the borrower will just be told to watch for a separate email from this
              vendor.
            </p>
          </div>
        )}

        {needType === "link" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-linkUrl`}>Link URL</Label>
            <Input
              id={`${formId}-linkUrl`}
              name="linkUrl"
              type="url"
              required
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="text-xs text-muted-foreground">
              E.g. an appraisal-fee payment page a lender sent over. The borrower sees this as a button to click —
              there&apos;s nothing to upload or answer, so mark it accepted once you&apos;ve confirmed it&apos;s done.
            </p>
          </div>
        )}

        {needType === "pandadoc_form" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-pandadocTemplateUuid`}>PandaDoc template UUID</Label>
            <Input
              id={`${formId}-pandadocTemplateUuid`}
              name="pandadocTemplateUuid"
              required
              value={pandadocTemplateUuid}
              onChange={(e) => setPandadocTemplateUuid(e.target.value)}
              placeholder="e.g. a1B2c3D4e5F6..."
            />
            <p className="text-xs text-muted-foreground">
              Upload the lender&apos;s application PDF as a template in PandaDoc first, mark its fields (assign the
              borrower-filled ones to the &quot;Client&quot; role), then paste that template&apos;s UUID here. When
              this need is added to a deal, we&apos;ll create and send that document automatically — the borrower
              fills and signs it from their upload page, and the completed PDF comes back here for review.
            </p>
          </div>
        )}

        {needType === "custom_form" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-customFormKey`}>Which form?</Label>
            <Select name="customFormKey" value={customFormKey} onValueChange={setCustomFormKey}>
              <SelectTrigger id={`${formId}-customFormKey`} className="w-full">
                <SelectValue placeholder="Select a form" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_NEED_FORM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              These are hand-built to match a specific lender&apos;s own application — new ones are added in code,
              not from here.
            </p>
          </div>
        )}

        {needType === "questionnaire" && (
          <div className="space-y-2">
            <Label>Questions</Label>
            {questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  name="questionText"
                  value={q.text}
                  onChange={(e) =>
                    setQuestions((prev) => prev.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))
                  }
                  placeholder={`Question ${i + 1}`}
                />
                <input type="hidden" name="questionRequired" value={q.required ? "1" : "0"} />
                <input type="hidden" name="questionId" value={q.id ?? ""} />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={q.required}
                    onCheckedChange={(v) =>
                      setQuestions((prev) => prev.map((p, j) => (j === i ? { ...p, required: v === true } : p)))
                    }
                  />
                  Required
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setQuestions((prev) => [...prev, { text: "", required: false }])}>
              + Add question
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </div>
  );
}
