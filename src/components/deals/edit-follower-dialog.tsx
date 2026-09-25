"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateDealFollower } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function EditFollowerDialog({
  dealId,
  follower,
}: {
  dealId: string;
  follower: { id: string; name: string; email: string; phone: string | null; roleLabel: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateDealFollower(dealId, follower.id, formData);
        setOpen(false);
        toast.success("Follower updated");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't save that.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit follower</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`follower-name-${follower.id}`}>Name</Label>
            <Input id={`follower-name-${follower.id}`} name="name" defaultValue={follower.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`follower-email-${follower.id}`}>Email</Label>
            <Input id={`follower-email-${follower.id}`} name="email" type="email" defaultValue={follower.email} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`follower-phone-${follower.id}`}>Phone (optional)</Label>
            <Input id={`follower-phone-${follower.id}`} name="phone" type="tel" defaultValue={follower.phone ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`follower-label-${follower.id}`}>Label (optional)</Label>
            <Input id={`follower-label-${follower.id}`} name="roleLabel" defaultValue={follower.roleLabel ?? ""} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
