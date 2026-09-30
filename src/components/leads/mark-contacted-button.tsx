"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markContacted } from "@/server/actions/leads";

export function MarkContactedButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await markContacted(leadId);
        toast.success("Marked contacted");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update.");
      }
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      {pending ? "Saving…" : "Mark Contacted"}
    </Button>
  );
}
