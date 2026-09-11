"use client";

import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function CopyClientNeedsButton({ items }: { items: string[] }) {
  return (
    <DropdownMenuItem
      onClick={async () => {
        const text = items.length
          ? `Outstanding client needs:\n${items.map((i) => `- ${i}`).join("\n")}`
          : "No outstanding client needs.";
        await navigator.clipboard.writeText(text);
        toast.success("List copied");
      }}
    >
      Copy list
    </DropdownMenuItem>
  );
}
