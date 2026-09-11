"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyIntakeLinkButton({ loanOfficerId }: { loanOfficerId: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/intake/${loanOfficerId}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy intake link"}
    </Button>
  );
}
