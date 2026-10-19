"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, StickyNote } from "lucide-react";
import { saveClientNeedsNote } from "@/server/actions/client-needs";
import { isActionError } from "@/lib/action-result";
import { CLIENT_NEEDS_NOTE_MAX } from "@/lib/client-needs-note";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ClientNeedsNoteData {
  text: string | null;
  updatedAt: string | null; // ISO
  updatedByName: string | null;
}

/**
 * The note to the processor at the very top of Client Needs: anything unusual
 * on this file that changes how a need should be requested (e.g. "ask for an
 * operating agreement that shows the GC at 20%+"). Anyone on the deal can edit it.
 */
export function ClientNeedsNote({ dealId, note }: { dealId: string; note: ClientNeedsNoteData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveClientNeedsNote(dealId, draft);
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(draft.trim() ? "Note saved" : "Note removed");
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <StickyNote className="size-4" />
          Note to the processor
        </p>
        <Textarea
          autoFocus
          rows={4}
          maxLength={CLIENT_NEEDS_NOTE_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Anything unique about this file the processor should know before requesting client needs…"
          className="bg-white"
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save note"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(note.text ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">Leave it empty to remove the note.</span>
        </div>
      </div>
    );
  }

  if (!note.text) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50"
      >
        <StickyNote className="size-4" />
        Add a note for the processor about anything unique on this file
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <StickyNote className="size-4" />
          Note to the processor
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-amber-900 hover:bg-amber-100"
          onClick={() => {
            setDraft(note.text ?? "");
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{note.text}</p>
      {note.updatedAt && (
        <p className="mt-2 text-xs text-amber-800/80">
          {note.updatedByName ? `${note.updatedByName} · ` : ""}
          {new Date(note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}
    </div>
  );
}
