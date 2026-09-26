"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  addRoomMember,
  getRoomMembers,
  listChatUsers,
  removeRoomMember,
  type ChatMember,
  type ChatUser,
} from "@/server/actions/team-chat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Who's in this chat, with add/remove for people who were explicitly added. */
export function RoomMembersDialog({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [pick, setPick] = useState("");
  const [pending, startTransition] = useTransition();

  async function load() {
    const [m, u] = await Promise.all([getRoomMembers(roomId), listChatUsers()]);
    setMembers(m.members);
    setUsers(u);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) load().catch(() => toast.error("Couldn't load members"));
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const available = users.filter((u) => !memberIds.has(u.id));

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        await load();
        toast.success(success);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Users className="size-3.5" />
          Members
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chat members</DialogTitle>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {m.name} <span className="text-xs text-muted-foreground">· {m.reason}</span>
              </span>
              {m.removable ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => removeRoomMember(roomId, m.userId), `${m.name} removed`)}
                >
                  Remove
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{m.reason === "Creator" ? "" : "Always has access"}</span>
              )}
            </li>
          ))}
          {members.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No one yet.</li>}
        </ul>
        <div className="flex items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Add a team member…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!pick || pending}
            onClick={() => run(() => addRoomMember(roomId, pick).then(() => setPick("")), "Added to chat")}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Deal chats always include the deal&apos;s loan officer, processor, assistant and admins. Add someone here to
          bring in a cover, and remove them when they&apos;re done.
        </p>
      </DialogContent>
    </Dialog>
  );
}
