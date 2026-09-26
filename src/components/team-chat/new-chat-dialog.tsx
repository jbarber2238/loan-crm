"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createGroupChat, listChatUsers, type ChatUser } from "@/server/actions/team-chat";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Start a private group chat with specific team members (you're added automatically). */
export function NewChatDialog({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) listChatUsers().then(setUsers).catch(() => toast.error("Couldn't load team members"));
  }

  function create() {
    startTransition(async () => {
      try {
        const id = await createGroupChat(name, [...selected]);
        setOpen(false);
        setName("");
        setSelected(new Set());
        router.push(`/team-chat?room=${id}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't create the chat");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="w-full">
          <Plus className="size-3.5" />
          New chat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New team chat</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="chat-name">Chat name</Label>
            <Input id="chat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Processing team" />
          </div>
          <div className="space-y-1.5">
            <Label>Who&apos;s in it</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {users
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={selected.has(u.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(u.id);
                          else next.delete(u.id);
                          return next;
                        })
                      }
                    />
                    {u.name}
                  </label>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">Only the people you pick can see this chat. You can add or remove people later.</p>
          </div>
          <Button type="button" className="w-full" disabled={pending || !name.trim()} onClick={create}>
            {pending ? "Creating…" : "Create chat"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
