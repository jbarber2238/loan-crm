"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import {
  uploadBorrowerDocument,
  submitClientNeedAnswers,
  getPandaDocSigningUrl,
  type BorrowerUploadNeed,
} from "@/server/actions/borrower-upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The finish-line reward: once a need is accepted it drops out of the
// interactive list entirely and becomes one calm, checked-off line — the
// visual payoff for the borrower having completed it.
export function AcceptedNeedRow({ need }: { need: BorrowerUploadNeed }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-green-600/20 bg-green-600/5 px-4 py-3">
      <CheckCircle2 className="size-5 shrink-0 text-green-600" aria-hidden="true" />
      <p className="text-sm text-muted-foreground line-through decoration-green-600/40">{need.itemName}</p>
    </div>
  );
}

const STATUS_LABEL: Record<BorrowerUploadNeed["status"], string> = {
  not_sent: "Needed",
  awaiting_docs: "Needed",
  review_needed: "Submitted — under review",
  accepted: "Complete",
};

function QuestionnaireForm({ token, need }: { token: string; need: BorrowerUploadNeed }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await submitClientNeedAnswers(token, need.id, formData);
        setSubmitted(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't submit that.");
      }
    });
  }

  if (!need.answers.length) {
    return <p className="text-xs text-muted-foreground">Awaiting your response.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {need.answers.map((a) => (
        <div key={a.id} className="space-y-1">
          <Label htmlFor={`answer-${a.id}`}>
            {a.questionText}
            {a.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input id={`answer-${a.id}`} name={`answer-${a.id}`} defaultValue={a.answerText ?? ""} required={a.required} />
        </div>
      ))}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Submitting…" : "Submit"}
      </Button>
      {submitted && !pending && <span className="ml-2 text-xs text-muted-foreground">Received, thank you!</span>}
    </form>
  );
}

function PandaDocFormButton({ token, need }: { token: string; need: BorrowerUploadNeed }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const url = await getPandaDocSigningUrl(token, need.id);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't open that form.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" disabled={pending} onClick={handleClick}>
        {pending ? "Opening…" : "Fill out and sign"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function BorrowerUploadNeedRow({ token, need }: { token: string; need: BorrowerUploadNeed }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("file", file);
    startTransition(async () => {
      try {
        await uploadBorrowerDocument(token, need.id, formData);
        setJustUploaded(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't upload those files.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{need.itemName}</p>
          {need.description && <p className="text-sm text-muted-foreground">{need.description}</p>}
          {need.needType === "document_upload" && need.minFiles > 1 && (
            <p className="text-xs text-amber-600">Please select all {need.minFiles} files at once (e.g. front &amp; back)</p>
          )}
        </div>
        <Badge variant={need.status === "review_needed" ? "warning" : "destructive"}>
          {STATUS_LABEL[need.status]}
        </Badge>
      </div>

      {need.rejectionNotes.length > 0 && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          Please resubmit — {need.rejectionNotes.join("; ")}
        </div>
      )}

      {need.needType === "document_upload" ? (
        <div className="space-y-2">
          {need.templateFileName && (
            <a
              href={`/api/deal-client-needs/${need.id}/template-file`}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-muted-foreground underline"
            >
              Download the form: {need.templateFileName}
            </a>
          )}
          <div className="flex items-center gap-2">
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleChange} />
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
              {pending ? "Uploading…" : "Upload file(s)"}
            </Button>
            {justUploaded && !pending && <span className="text-xs text-muted-foreground">Received, thank you!</span>}
          </div>
        </div>
      ) : need.needType === "questionnaire" ? (
        <QuestionnaireForm token={token} need={need} />
      ) : need.needType === "link" ? (
        need.linkUrl ? (
          <Button asChild size="sm">
            <a href={need.linkUrl} target="_blank" rel="noreferrer">
              Open link
            </a>
          </Button>
        ) : null
      ) : need.needType === "pandadoc_form" ? (
        need.pandadocDocumentId ? (
          <PandaDocFormButton token={token} need={need} />
        ) : (
          <p className="text-xs text-muted-foreground">This form is still being set up — check back shortly.</p>
        )
      ) : need.needType === "custom_form" ? (
        <Button asChild size="sm">
          <a href={`/borrower-upload/${token}/form/${need.id}`}>
            {need.status === "not_sent" || need.status === "awaiting_docs" ? "Fill out application" : "Review submission"}
          </a>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Awaiting your e-signature — check your email for that link.</p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
