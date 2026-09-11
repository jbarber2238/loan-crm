"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientNeedFromCondition } from "@/server/actions/conditions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateClientNeedFromConditionDialog({
  dealId,
  conditionId,
  suggestedNeedName,
  suggestedNeedDescription,
}: {
  dealId: string;
  conditionId: string;
  suggestedNeedName: string;
  suggestedNeedDescription: string | null;
}) {
  const router = useRouter();
  const create = createClientNeedFromCondition.bind(null, dealId, conditionId);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await create(formData);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create the client need.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          Add as client need
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add as client need</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`itemName-${conditionId}`}>Item name</Label>
            <Input id={`itemName-${conditionId}`} name="itemName" defaultValue={suggestedNeedName} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`description-${conditionId}`}>Description</Label>
            <Textarea
              id={`description-${conditionId}`}
              name="description"
              rows={3}
              defaultValue={suggestedNeedDescription ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isStandard" />
            Standard client need (available for every future deal, not just this one)
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Adding…" : "Add to Client Needs"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
