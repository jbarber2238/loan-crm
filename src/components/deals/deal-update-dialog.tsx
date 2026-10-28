"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sendDealUpdate, type DealTextThread } from "@/server/actions/messages";

/**
 * One message to several people on the loan. Not a group text: everyone gets their own text, can't see who else did,
 * and what they write back lands in their own thread.
 */
export function DealUpdateDialog({ dealId, people }: { dealId: string; people: DealTextThread[] }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  // The borrower and followers start ticked; title and insurance are one tap away, never a surprise.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) setPicked(new Set(people.filter((p) => p.role === "Borrower" || p.role === "Referral Partner").map((p) => p.phone)));
    setOpen(next);
  }

  function toggle(phone: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  function send() {
    startTransition(async () => {
      try {
        const result = await sendDealUpdate(dealId, [...picked], body);
        if (result.failed.length === 0) {
          toast.success(`Sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}`);
        } else {
          toast.error(`Sent to ${result.sent}. Couldn't reach ${result.failed.map((f) => f.name).join(", ")}.`);
        }
        if (result.sent > 0) {
          setBody("");
          setOpen(false);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't send that update");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Send className="size-3.5" />
          Send update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send an update</DialogTitle>
          <DialogDescription>
            Each person gets their own text. They can&apos;t see who else got it, and their replies come back to their own conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {people.map((p) => (
            <label key={p.phone} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <Checkbox checked={picked.has(p.phone)} onCheckedChange={() => toggle(p.phone)} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.role === "Referral Partner" ? "Follower" : p.role}</span>
            </label>
          ))}
        </div>

        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your update…" rows={4} />

        <DialogFooter>
          <Button type="button" disabled={pending || picked.size === 0 || !body.trim()} onClick={send}>
            {pending ? "Sending…" : `Send to ${picked.size} ${picked.size === 1 ? "person" : "people"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
