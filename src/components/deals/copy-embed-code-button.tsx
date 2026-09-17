"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Hardcoded to the public brand domain rather than window.location.origin —
// staff usually work from the internal Vercel URL day to day, but the
// embed snippet needs to point at the branded intake page regardless of
// which URL they're viewing this settings page from.
const EMBED_ORIGIN = "https://mannalendingco.com";

export function CopyEmbedCodeButton({
  loanOfficerId,
  affiliateId,
}: {
  loanOfficerId: string;
  // When set, tags the embed so deals submitted through it are tracked as
  // this affiliate's referral.
  affiliateId?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        const query = affiliateId ? `?aff=${affiliateId}` : "";
        const src = `${EMBED_ORIGIN}/embed/intake/${loanOfficerId}${query}`;
        const snippet = `<iframe src="${src}" style="width:100%;max-width:720px;height:2200px;border:none;" title="Loan Inquiry"></iframe>`;
        await navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy embed code"}
    </Button>
  );
}
