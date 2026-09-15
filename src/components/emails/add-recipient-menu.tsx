"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { RecipientCandidate } from "@/lib/email-recipients";

/**
 * A "+ Add" affordance next to a recipient field, listing the deal's team,
 * lender rep, and any manually-added followers. Followers are flagged in
 * the candidate list (they're arbitrary outside contacts, not known CRM
 * people), so picking one warns first — everyone else adds immediately.
 */
export function AddRecipientMenu({
  candidates,
  onAdd,
  label = "Add",
}: {
  candidates: RecipientCandidate[];
  onAdd: (email: string) => void;
  label?: string;
}) {
  const [pendingFollower, setPendingFollower] = useState<RecipientCandidate | null>(null);

  if (candidates.length === 0) return null;

  const followers = candidates.filter((c) => c.isFollower);
  const others = candidates.filter((c) => !c.isFollower);

  function handlePick(candidate: RecipientCandidate) {
    if (candidate.isFollower) {
      setPendingFollower(candidate);
      return;
    }
    onAdd(candidate.email);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground">
            <Plus className="size-3" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {others.map((c) => (
            <DropdownMenuItem key={c.email} onClick={() => handlePick(c)}>
              {c.label}
            </DropdownMenuItem>
          ))}
          {followers.length > 0 && (
            <>
              {others.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">Followers</DropdownMenuLabel>
              {followers.map((c) => (
                <DropdownMenuItem key={c.email} onClick={() => handlePick(c)}>
                  {c.label}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={pendingFollower !== null}
        title="Add someone from outside your organization?"
        message={`${pendingFollower?.label ?? ""} is a follower on this deal, not someone in your organization. Are you sure you want to add them to this email?`}
        onCancel={() => setPendingFollower(null)}
        onConfirm={() => {
          if (pendingFollower) onAdd(pendingFollower.email);
          setPendingFollower(null);
        }}
      />
    </>
  );
}
