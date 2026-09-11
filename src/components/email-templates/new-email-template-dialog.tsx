"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createEmailTemplate } from "@/server/actions/email-templates";
import { draftEmailTemplateWithAI } from "@/server/ai/email-template-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES } from "@/lib/labels";
import { BORROWER_LIFECYCLE_TOKENS } from "@/lib/email-template-tokens";

export function NewEmailTemplateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [triggerStage, setTriggerStage] = useState("none");

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showTokens, setShowTokens] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPending, startAiTransition] = useTransition();

  function resetForm() {
    setName("");
    setSubject("");
    setBody("");
    setTriggerStage("none");
    setAiPrompt("");
    setError(null);
  }

  function handleGenerate() {
    setError(null);
    startAiTransition(async () => {
      try {
        const draft = await draftEmailTemplateWithAI(aiPrompt, "borrower_lifecycle");
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
        await createEmailTemplate(formData);
        setOpen(false);
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>New Template</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New borrower email template</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor="new-template-ai-prompt" className="flex items-center gap-1.5 text-sm">
            <Sparkles className="size-3.5" />
            Draft with AI
          </Label>
          <div className="flex gap-2">
            <Input
              id="new-template-ai-prompt"
              placeholder="e.g. congratulate the borrower once their loan closes"
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-template-name">Template Name</Label>
            <Input
              id="new-template-name"
              name="name"
              required
              placeholder="e.g. Welcome Email"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-template-subject">Subject</Label>
            <Input
              id="new-template-subject"
              name="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-template-body">Body</Label>
              <button
                type="button"
                onClick={() => setShowTokens((v) => !v)}
                className="text-xs text-muted-foreground underline"
              >
                {showTokens ? "Hide" : "Show"} merge fields
              </button>
            </div>
            <Textarea
              id="new-template-body"
              name="body"
              rows={8}
              required
              className="font-mono text-xs"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {showTokens && (
              <div className="flex flex-wrap gap-1 rounded-md bg-muted/40 p-2">
                {BORROWER_LIFECYCLE_TOKENS.map((t) => (
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
          <div className="space-y-1.5">
            <Label>Send at pipeline stage</Label>
            <Select name="triggerStage" value={triggerStage} onValueChange={setTriggerStage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not tied to a stage yet</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This just tags the template for now — automated sending gets wired up separately.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create template"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
