"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  quickPricerUrl?: string | null;
  reps: { id: string; name: string; email: string }[];
}

export function PriceLoanDialog({ dealId, lenders }: { dealId: string; lenders: LenderWithReps[] }) {
  const router = useRouter();
  const createRequests = createPricingRequests.bind(null, dealId);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedRepIds, setSelectedRepIds] = useState<Set<string>>(new Set());

  function toggleRep(repId: string, checked: boolean) {
    setSelectedRepIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(repId);
      else next.delete(repId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await createRequests(formData);
        setOpen(false);
        setSelectedRepIds(new Set());
        toast.success("Draft emails created");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        toast.error(message);
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
                    <div key={rep.id} className="space-y-1">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          name="lenderRepIds"
                          value={rep.id}
                          checked={selectedRepIds.has(rep.id)}
                          onCheckedChange={(checked) => toggleRep(rep.id, checked === true)}
                        />
                        {rep.name} ({rep.email})
                      </label>
                      {lender.quickPricerUrl && selectedRepIds.has(rep.id) && (
                        <label className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                          <Checkbox name="alsoEmailRepIds" value={rep.id} />
                          Also email {rep.name.split(" ")[0]} for help pricing this one
                        </label>
                      )}
                    </div>
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
