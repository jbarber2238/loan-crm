"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyIntakeLinkButton({
  loanOfficerId,
  affiliateId,
}: {
  loanOfficerId: string;
  // When set, tags the link so deals submitted through it are tracked as
  // this affiliate's referral, instead of copying the loan officer's own
  // plain intake link.
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
        await navigator.clipboard.writeText(`${window.location.origin}/intake/${loanOfficerId}${query}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy intake link"}
    </Button>
  );
}
