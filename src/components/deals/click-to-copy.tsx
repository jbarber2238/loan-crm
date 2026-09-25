"use client";

import { toast } from "sonner";

/** Click-to-copy text — one click puts the value on the clipboard (e.g. to paste a borrower's phone/email to a title company). */
export function ClickToCopy({ value, label }: { value: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy the ${label.toLowerCase()}`);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Click to copy ${label.toLowerCase()}`}
      className="cursor-copy rounded-sm hover:bg-muted hover:text-foreground focus-visible:outline-2"
    >
      {value}
    </button>
  );
}
