"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { updateEmailTemplate, deleteEmailTemplate } from "@/server/actions/email-templates";
import { draftEmailTemplateWithAI } from "@/server/ai/email-template-draft";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES } from "@/lib/labels";
import { tokensForCategory } from "@/lib/email-template-tokens";

export interface EmailTemplateRow {
  id: string;
  key: string;
  name: string;
  category: "pricing_request" | "borrower_lifecycle";
  subject: string;
  body: string;
  triggerStage: string | null;
  active: boolean;
}

export function EmailTemplateCard({ template }: { template: EmailTemplateRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const [triggerStage, setTriggerStage] = useState(template.triggerStage ?? "none");

  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [active, setActive] = useState(template.active);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPending, startAiTransition] = useTransition();

  const tokens = tokensForCategory(template.category);

  const isDirty =
    name !== template.name ||
    subject !== template.subject ||
    body !== template.body ||
    active !== template.active ||
    triggerStage !== (template.triggerStage ?? "none");

  function handleRevert() {
    setError(null);
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
    setActive(template.active);
    setTriggerStage(template.triggerStage ?? "none");
  }

  function handleGenerate() {
    setError(null);
    startAiTransition(async () => {
      try {
        const draft = await draftEmailTemplateWithAI(aiPrompt, template.category);
        setName(draft.name);
        setSubject(draft.subject);
        setBody(draft.body);
        if (draft.triggerStage) setTriggerStage(draft.triggerStage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't generate a draft.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateEmailTemplate(template.id, formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save.");
      }
    });
  }

  const boundDelete = deleteEmailTemplate.bind(null, template.id);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left">
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm font-medium">{template.name}</span>
        {!template.active && <Badge variant="secondary">Inactive</Badge>}
        <code className="text-xs text-muted-foreground">{template.key}</code>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 border-t p-4">
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label htmlFor={`ai-prompt-${template.id}`} className="flex items-center gap-1.5 text-sm">
              <Sparkles className="size-3.5" />
              Draft with AI
            </Label>
            <div className="flex gap-2">
              <Input
                id={`ai-prompt-${template.id}`}
                placeholder="e.g. let the borrower know their term sheet is ready to review"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={aiPending || !aiPrompt.trim()}
                onClick={handleGenerate}
              >
                {aiPending ? "Drafting…" : "Generate"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              It&apos;ll pick the right merge fields for you from what&apos;s available below.
            </p>
          </div>

          <form id={`template-form-${template.id}`} onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${template.id}`}>Template Name</Label>
              <Input
                id={`name-${template.id}`}
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`subject-${template.id}`}>Subject</Label>
              <Input
                id={`subject-${template.id}`}
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`body-${template.id}`}>Body</Label>
                <button
                  type="button"
                  onClick={() => setShowTokens((v) => !v)}
                  className="text-xs text-muted-foreground underline"
                >
                  {showTokens ? "Hide" : "Show"} merge fields
                </button>
              </div>
              <Textarea
                id={`body-${template.id}`}
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                required
                className="font-mono text-xs"
              />
              {showTokens && (
                <div className="flex flex-wrap gap-1 rounded-md bg-muted/40 p-2">
                  {tokens.map((t) => (
                    <code
                      key={t.key}
                      title={t.description}
                      className="rounded bg-background px-1.5 py-0.5 text-[10px] border"
                    >
                      {`{{${t.key}}}`}
                    </code>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {template.category === "borrower_lifecycle" && (
                <div className="space-y-1.5">
                  <Label>Send at pipeline stage</Label>
                  <Select name="triggerStage" value={triggerStage} onValueChange={setTriggerStage}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not tied to a stage yet</SelectItem>
                      {STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="active" checked={active} onCheckedChange={(v) => setActive(v === true)} />
                Active
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
              {template.category === "borrower_lifecycle" && (
                <form action={boundDelete}>
                  <ConfirmSubmitButton
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    confirmMessage={`Delete the "${template.name}" template? This can't be undone.`}
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isDirty || isPending}
                onClick={handleRevert}
              >
                Revert to saved
              </Button>
              <Button type="submit" form={`template-form-${template.id}`} size="sm" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
