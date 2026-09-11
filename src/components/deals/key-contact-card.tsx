"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface KeyContactField {
  name: string;
  label: string;
  value: string | null;
}

// Discrete, independently-editable fields rather than a read-only dump of
// whatever the client need last said — a processor may have gathered this
// over the phone (no client need involved at all), deleted the client need
// after collecting it, or need to update it mid-deal. "Mark Accepted" on the
// matching client need auto-fills these once; after that they're just plain
// fields a processor can edit here any time, independent of that need.
export function KeyContactCard({
  title,
  fields,
  dealId,
  saveAction,
}: {
  title: string;
  fields: KeyContactField[];
  dealId: string;
  saveAction: (dealId: string, formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = fields.filter((f) => f.value);

  async function handleCopy() {
    if (!filled.length) return;
    const text = filled.map((f) => `${f.label}: ${f.value}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await saveAction(dealId, formData);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!filled.length} onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit {title}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                {fields.map((f) => (
                  <div key={f.name} className="space-y-1.5">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <Input id={f.name} name={f.name} defaultValue={f.value ?? ""} />
                  </div>
                ))}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {filled.length ? (
          <div className="space-y-1 text-sm">
            {filled.map((f) => (
              <p key={f.name}>
                <span className="text-muted-foreground">{f.label}: </span>
                <span className="font-medium">{f.value}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not collected yet — fills in automatically once the matching client need is marked
            accepted, or click Edit to enter it directly.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
