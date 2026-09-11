"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPricingRequests } from "@/server/actions/pricing";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface LenderWithReps {
  id: string;
  name: string;
  reps: { id: string; name: string; email: string }[];
}

export function PriceLoanDialog({ dealId, lenders }: { dealId: string; lenders: LenderWithReps[] }) {
  const router = useRouter();
  const createRequests = createPricingRequests.bind(null, dealId);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createRequests(formData);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Price Loan</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select lenders to price</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {lenders.map((lender) => (
              <div key={lender.id}>
                <p className="text-sm font-medium mb-1">{lender.name}</p>
                <div className="space-y-1 pl-2">
                  {lender.reps.map((rep) => (
                    <label key={rep.id} className="flex items-center gap-2 text-sm">
                      <Checkbox name="lenderRepIds" value={rep.id} />
                      {rep.name} ({rep.email})
                    </label>
                  ))}
                  {lender.reps.length === 0 && (
                    <p className="text-xs text-muted-foreground">No reps on file</p>
                  )}
                </div>
              </div>
            ))}
            {lenders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No lenders yet — add one under Admin → Lenders.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create draft emails"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
