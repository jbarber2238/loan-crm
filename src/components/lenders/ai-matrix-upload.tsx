"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { uploadLenderDocumentsWithAI, type AiFiledDocument } from "@/server/actions/lender-document-ai-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AiMatrixUpload({ lenderId }: { lenderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AiFiledDocument[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResults(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const filed = await uploadLenderDocumentsWithAI(lenderId, formData);
        setResults(filed);
        formRef.current?.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-2 rounded-md border border-dashed p-3">
      <Label htmlFor={`ai-matrix-file-${lenderId}`} className="flex items-center gap-1.5 text-sm">
        <Sparkles className="size-3.5" />
        Upload matrix or guidelines — AI will file it under the right product
      </Label>
      <div className="flex gap-2">
        <Input id={`ai-matrix-file-${lenderId}`} name="file" type="file" multiple required />
        <Button type="submit" disabled={pending}>
          {pending ? "Reading…" : "Upload"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {results && (
        <ul className="space-y-1 text-sm">
          {results.map((r, i) => (
            <li key={i} className="text-muted-foreground">
              <span className="font-medium text-foreground">{r.fileName}</span> — filed under{" "}
              {r.filedUnder.join(", ")}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
