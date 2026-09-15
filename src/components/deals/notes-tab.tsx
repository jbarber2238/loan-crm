"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addDealNote, deleteDealNote, resolveDealNote } from "@/server/actions/deals";
import { buildClientNeedsContextNote } from "@/server/actions/client-needs";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";

interface Note {
  id: string;
  body: string;
  source: "user" | "ai" | "system";
  resolved: boolean;
  createdAt: Date;
  author?: { name: string | null } | null;
  canDelete: boolean;
}

export function NotesTab({ dealId, notes }: { dealId: string; notes: Note[] }) {
  const addNote = addDealNote.bind(null, dealId);
  const sorted = [...notes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const [body, setBody] = useState("");
  const [pullingContext, setPullingContext] = useState(false);

  function handlePullContext() {
    setPullingContext(true);
    buildClientNeedsContextNote(dealId)
      .then((text) => setBody(text))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't pull client need context."))
      .finally(() => setPullingContext(false));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <ActionForm
            action={addNote}
            successMessage="Note added"
            onSuccess={() => setBody("")}
            className="space-y-3"
          >
            <Textarea
              name="body"
              rows={5}
              placeholder="Add a note..."
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <SubmitButton>Add note</SubmitButton>
              <Button type="button" variant="outline" disabled={pullingContext} onClick={handlePullContext}>
                {pullingContext ? "Pulling…" : "Pull Client Need Context"}
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {sorted.map((note) => {
          const resolveNote = resolveDealNote.bind(null, dealId, note.id);
          const deleteNote = deleteDealNote.bind(null, dealId, note.id);
          return (
            <Card key={note.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant={note.source === "user" ? "outline" : "secondary"}>
                      {note.source === "ai" ? "AI" : note.source === "system" ? "System" : (note.author?.name ?? "User")}
                    </Badge>
                    <span>{note.createdAt.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {note.source === "ai" && !note.resolved && (
                      <ActionForm action={resolveNote} successMessage="Note dismissed">
                        <SubmitButton size="sm" variant="ghost">
                          Dismiss
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {note.source === "ai" && note.resolved && (
                      <span className="text-[10px]">Dismissed</span>
                    )}
                    {note.canDelete && (
                      <ActionForm
                        action={deleteNote}
                        successMessage="Note deleted"
                        confirmMessage="Delete this note? This can't be undone."
                      >
                        <SubmitButton size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          Delete
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
              </CardContent>
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </div>
    </div>
  );
}
