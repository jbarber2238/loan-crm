"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** One click copies the borrower's name, phone and email as plain lines — e.g. to paste to a title company. */
export function CopyBorrowerContactButton({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string | null;
  email: string | null;
}) {
  async function copy() {
    const text = [name, phone, email].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Borrower contact info copied");
    } catch {
      toast.error("Couldn't copy the contact info");
    }
  }

  return (
    <Button type="button" variant="outline" size="xs" onClick={copy}>
      <Copy className="size-3" />
      Copy borrower contact info
    </Button>
  );
}
