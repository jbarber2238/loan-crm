"use client";

import Link from "next/link";
import { Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomMembersDialog } from "@/components/team-chat/room-members-dialog";
import { TeamChatPanel } from "@/components/team-chat/team-chat-panel";
import { useIsPhone } from "@/lib/use-is-phone";
import type { TeamDockWindow as DockWindow } from "@/components/team-chat/team-dock-context";

/** One floating internal chat. On a phone the chat panel takes the whole screen by itself, so the frame only draws on larger screens. */
export function TeamDockWindow({ w, onClose, onMinimize }: { w: DockWindow; onClose: () => void; onMinimize: () => void }) {
  const isPhone = useIsPhone();
  const showMembers = w.kind === "group" || w.kind === "deal";

  if (isPhone) {
    return <TeamChatPanel roomId={w.roomId} phoneTitle={w.title} showMembers={showMembers} onBack={onClose} />;
  }

  return (
    <div className="flex h-[min(460px,70vh)] w-[22rem] flex-col rounded-t-lg border border-b-0 bg-popover shadow-xl">
      <div className="flex items-center justify-between gap-1 rounded-t-lg border-b bg-muted px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{w.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Internal only
            {w.kind === "deal" && w.dealId && (
              <>
                {" · "}
                <Link href={`/deals/${w.dealId}/loan-center`} className="text-primary hover:underline">
                  Open deal
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {showMembers && <RoomMembersDialog roomId={w.roomId} />}
          <Button type="button" variant="ghost" size="icon-sm" onClick={onMinimize} title="Minimize" aria-label="Minimize">
            <Minus className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} title="Close" aria-label="Close">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TeamChatPanel roomId={w.roomId} showMembers={false} dock />
      </div>
    </div>
  );
}
