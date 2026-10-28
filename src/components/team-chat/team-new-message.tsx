"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listChatUsers, startTeamConversation, type ChatRoomSummary, type ChatUser } from "@/server/actions/team-chat";
import { useTeamDock } from "@/components/team-chat/team-dock-context";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

const KIND_LABEL: Record<ChatRoomSummary["kind"], string> = {
  general: "Everyone",
  group: "Group",
  dm: "Direct message",
  deal: "Deal chat",
};

/**
 * The pencil's panel: your recent internal conversations on top, and below them a way to start a new one.
 * Pick one person for a direct message, or several for a group.
 */
export function TeamNewMessage({
  rooms,
  currentUserId,
  onClose,
}: {
  rooms: ChatRoomSummary[];
  currentUserId: string;
  onClose: () => void;
}) {
  const { openRoom } = useTeamDock();
  const [people, setPeople] = useState<ChatUser[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listChatUsers().then(setPeople).catch(() => toast.error("Couldn't load your team"));
  }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => people.filter((p) => p.id !== currentUserId && (!q || p.name.toLowerCase().includes(q))),
    [people, currentUserId, q]
  );
  const recent = useMemo(() => (q ? [] : rooms.slice(0, 8)), [rooms, q]);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openExisting(r: ChatRoomSummary) {
    openRoom({ roomId: r.roomId, title: r.title, kind: r.kind, dealId: r.dealId });
    onClose();
  }

  function start() {
    startTransition(async () => {
      try {
        const { roomId, title } = await startTeamConversation(picked, groupName);
        openRoom({ roomId, title, kind: picked.length === 1 ? "dm" : "group", dealId: null });
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't start that chat");
      }
    });
  }

  const pickedNames = picked.map((id) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "");

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-popover sm:static sm:z-auto sm:h-[min(460px,70vh)] sm:w-80 sm:rounded-t-lg sm:border sm:border-b-0 sm:shadow-xl">
      <div className="flex items-center justify-between border-b bg-muted px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:rounded-t-lg sm:pt-2">
        <div>
          <p className="text-base font-semibold sm:text-sm">Team messages</p>
          <p className="text-[11px] text-muted-foreground">Internal only. Clients never see these.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="border-b p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your team…"
          className="h-11 text-base sm:h-8 sm:text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {recent.length > 0 && (
          <div className="border-b p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
            {recent.map((r) => (
              <button
                key={r.roomId}
                type="button"
                onClick={() => openExisting(r)}
                className={cn("flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted sm:py-1.5", r.unread > 0 && "bg-primary/5")}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", r.unread > 0 && "font-semibold")}>{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.lastMessage ? `${r.lastMessage.authorName.split(" ")[0]}: ${r.lastMessage.body}` : KIND_LABEL[r.kind]}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  {r.lastMessage && <span className="text-[10px] text-muted-foreground">{timeAgo(r.lastMessage.createdAt)}</span>}
                  {r.unread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{r.unread}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="p-1.5">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {picked.length > 1 ? "Group chat" : "Start a new chat"}
          </p>
          {visible.length === 0 && <p className="p-2 text-xs text-muted-foreground">No one matches.</p>}
          {visible.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted sm:py-1.5", on && "bg-muted")}
              >
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on && "border-primary bg-primary text-primary-foreground")}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{p.role.replace(/_/g, " ")}</span>
              </button>
            );
          })}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="space-y-1.5 border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {picked.length > 1 && (
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={`Group name (optional) — ${pickedNames.join(", ")}`}
              className="h-9 text-sm"
            />
          )}
          <Button type="button" className="w-full" disabled={pending} onClick={start}>
            {pending ? "Starting…" : picked.length === 1 ? `Message ${pickedNames[0]}` : `Start group chat (${picked.length + 1})`}
          </Button>
        </div>
      )}
    </div>
  );
}
