"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteTeamChat, renameGroupChat } from "@/server/actions/team-chat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Rename and delete for a group chat or direct message, for whoever the server lets manage it
 * (an admin, or the person who created the chat). Pass only the buttons the viewer may use.
 */
export function RoomActions({
  roomId,
  name,
  kind,
  canRename,
  canDelete,
}: {
  roomId: string;
  name: string;
  kind: "group" | "dm";
  canRename: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const openRoomId = useSearchParams().get("room");
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, startTransition] = useTransition();

  function rename() {
    startTransition(async () => {
      try {
        await renameGroupChat(roomId, draft);
        setRenameOpen(false);
        toast.success("Chat renamed");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't rename the chat");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        await deleteTeamChat(roomId);
        setDeleteOpen(false);
        toast.success("Chat deleted");
        // Only leave the page if this is the chat that's open; deleting another one from the list stays put.
        if (openRoomId === roomId) router.push("/team-chat");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't delete the chat");
      }
    });
  }

  return (
    <>
      {canRename && (
        <Dialog
          open={renameOpen}
          onOpenChange={(next) => {
            setRenameOpen(next);
            if (next) setDraft(name);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Pencil className="size-3.5" />
              Rename
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename chat</DialogTitle>
              <DialogDescription>Everyone in the chat will see the new name.</DialogDescription>
            </DialogHeader>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && !pending) rename();
              }}
              aria-label="Chat name"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={pending || !draft.trim() || draft.trim() === name} onClick={rename}>
                {pending ? "Saving…" : "Save name"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {canDelete && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive">
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{kind === "dm" ? "Delete this conversation?" : `Delete "${name}"?`}</DialogTitle>
              <DialogDescription>
                {kind === "dm"
                  ? "The whole conversation, including files, is deleted for both of you. This can't be undone."
                  : "Every message and file in this chat is deleted for everyone in it. This can't be undone."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
                {pending ? "Deleting…" : "Delete chat"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
