"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { createDscrConversionLink } from "@/server/actions/deal-conversion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DscrConversionLinkDialog({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setUrl(null);
    setCopied(false);
    setLoading(true);
    createDscrConversionLink(dealId)
      .then((token) => setUrl(`${window.location.origin}/dscr-refi/${token}`))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't create this link."))
      .finally(() => setLoading(false));
  }

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Send DSCR Refinance Intake</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>DSCR refinance intake link</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Send this to the borrower once the project&apos;s done and they&apos;re ready to refinance into a DSCR
          loan. It&apos;s pre-filled with what we already know about them and this property — they just confirm
          that and fill in the new refinance details. Submitting it creates a brand new deal; this one is
          unaffected.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Creating link…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : url ? (
          <div className="flex items-center gap-2">
            <Input readOnly value={url} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copyLink} aria-label="Copy link">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
