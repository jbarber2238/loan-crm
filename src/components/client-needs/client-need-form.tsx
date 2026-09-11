"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { draftClientNeedWithAI } from "@/server/ai/client-need-draft";
import { getClientNeedProductIds } from "@/server/actions/client-need-catalog";
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

type NeedType = "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form";

export interface ExistingClientNeed {
  id: string;
  itemName: string;
  description: string | null;
  category: string | null;
  needType: NeedType;
  esignVendor: string | null;
  linkUrl: string | null;
  pandadocTemplateUuid: string | null;
  templateFileName: string | null;
  isCustom: boolean;
  isGlobal: boolean;
  loanCategories: string[];
  questions: { questionText: string }[];
}

export function ClientNeedForm({
  formId,
  clientNeed,
  allProducts = [],
  onSubmit,
  submitLabel,
  pending,
  error,
}: {
  formId: string;
  clientNeed?: ExistingClientNeed;
  allProducts?: { id: string; label: string }[];
  onSubmit: (formData: FormData) => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
}) {
  const isEdit = !!clientNeed;

  const [itemName, setItemName] = useState(clientNeed?.itemName ?? "");
  const [description, setDescription] = useState(clientNeed?.description ?? "");
  const [category, setCategory] = useState(clientNeed?.category ?? "other");
  const [isStandard, setIsStandard] = useState(clientNeed?.isCustom === false);
  const [isGlobal, setIsGlobal] = useState(clientNeed?.isGlobal ?? false);
  const [loanCategories, setLoanCategories] = useState<string[]>(clientNeed?.loanCategories ?? []);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productIdsLoading, setProductIdsLoading] = useState(isEdit);
  const [productSearch, setProductSearch] = useState("");
  const [needType, setNeedType] = useState<NeedType>(clientNeed?.needType ?? "document_upload");
  const [esignVendor, setEsignVendor] = useState(clientNeed?.esignVendor ?? "");
  const [linkUrl, setLinkUrl] = useState(clientNeed?.linkUrl ?? "");
  const [pandadocTemplateUuid, setPandadocTemplateUuid] = useState(clientNeed?.pandadocTemplateUuid ?? "");
  const [questions, setQuestions] = useState<string[]>(
    clientNeed?.questions.length ? clientNeed.questions.map((q) => q.questionText) : [""]
  );
  const [removeFile, setRemoveFile] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPending, startAiTransition] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetched lazily (not passed as a prop) so a save from any page — a
  // specific lender's product view or the shared catalog — always starts
  // from the true, complete cross-lender attachment list and never
  // silently drops one this page's own data happened not to include.
  useEffect(() => {
    if (!clientNeed) return;
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

  function handleGenerate() {
    setAiError(null);
    startAiTransition(async () => {
      try {
        const draft = await draftClientNeedWithAI(aiPrompt);
        setItemName(draft.itemName);
        setDescription(draft.description);
        setNeedType(draft.needType);
        setEsignVendor(draft.esignVendor ?? "");
        setQuestions(draft.questions.length ? draft.questions : [""]);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "Couldn't generate a draft.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <div className="space-y-4">
      {!isEdit && (
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
                    {allProducts
                      .filter((p) => p.label.toLowerCase().includes(productSearch.toLowerCase()))
                      .map((p) => (
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
                    {allProducts.filter((p) => p.label.toLowerCase().includes(productSearch.toLowerCase()))
                      .length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches.</p>
                    )}
                  </div>
                  {productIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{productIds.length} selected</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

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

        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-needType`}>Type</Label>
          <Select name="needType" value={needType} onValueChange={(v) => setNeedType(v as NeedType)}>
            <SelectTrigger id={`${formId}-needType`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_NEED_TYPES.map((t) => (
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
                  href={`/api/client-needs/${clientNeed.id}/file`}
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

        {needType === "esign" && (
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

        {needType === "questionnaire" && (
          <div className="space-y-2">
            <Label>Questions</Label>
            {questions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  name="questionText"
                  value={q}
                  onChange={(e) => setQuestions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                  placeholder={`Question ${i + 1}`}
                />
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
            <Button type="button" size="sm" variant="outline" onClick={() => setQuestions((prev) => [...prev, ""])}>
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
