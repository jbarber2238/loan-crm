"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addDealNote, deleteDealNote, resolveDealNote, updateDealNote } from "@/server/actions/deals";
import { buildClientNeedsContextNote, getOutstandingClientNeedLines, getStandContextLines } from "@/server/actions/client-needs";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { COMPOSE_UPDATE_EVENT, COMPOSE_UPDATE_KEY } from "@/lib/loan-center-events";
import { EOD_TEMPLATE, hasOutstandingSection, withOutstandingSection, withStandContext } from "@/lib/tasks";

interface Note {
  id: string;
  body: string;
  source: "user" | "ai" | "system";
  resolved: boolean;
  isUpdate: boolean;
  createdAt: Date;
  author?: { name: string | null } | null;
  canDelete: boolean;
  canEdit: boolean;
  editedAt?: Date | null;
}

// A posted note, reworded in place by its author.
function NoteEditor({ dealId, note, onDone }: { dealId: string; note: Note; onDone: () => void }) {
  const [text, setText] = useState(note.body);
  const [saving, startSaving] = useTransition();

  function save() {
    startSaving(async () => {
      try {
        await updateDealNote(dealId, note.id, text);
        toast.success("Note updated");
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save that. Try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea rows={Math.min(14, Math.max(4, text.split("\n").length + 1))} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={saving || !text.trim()} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function NotesTab({ dealId, notes }: { dealId: string; notes: Note[] }) {
  const sorted = [...notes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  // The newest end-of-day update written by a person is the one shown under the deal header.
  const latestUpdateId = sorted.find((n) => n.isUpdate && n.source === "user")?.id ?? null;
  const [body, setBody] = useState("");
  // "eod" is chosen with Start end-of-day update and stays that way: it posts as the Latest update under the header.
  // Anything else is a regular note, even with the client needs pulled in.
  const [mode, setMode] = useState<"note" | "eod">("note");
  const [pullingContext, setPullingContext] = useState(false);
  const [posting, startPosting] = useTransition();
  const [outstandingPrompt, setOutstandingPrompt] = useState<string[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const eod = mode === "eod";

  function startUpdate() {
    setMode("eod");
    setBody((current) => (current.trim() ? current : EOD_TEMPLATE));
    setTimeout(() => bodyRef.current?.focus(), 0);
  }

  // The banner's "Write today's update" lands here: either already mounted (event) or just opened (flag).
  useEffect(() => {
    function fromBanner() {
      try {
        sessionStorage.removeItem(COMPOSE_UPDATE_KEY);
      } catch {
        // Nothing to clean up.
      }
      startUpdate();
    }
    try {
      if (sessionStorage.getItem(COMPOSE_UPDATE_KEY) === dealId) fromBanner();
    } catch {
      // Storage blocked: the tab just opens as usual.
    }
    window.addEventListener(COMPOSE_UPDATE_EVENT, fromBanner);
    return () => window.removeEventListener(COMPOSE_UPDATE_EVENT, fromBanner);
  }, [dealId]);

  function post(text: string, asUpdate: boolean) {
    startPosting(async () => {
      try {
        const fd = new FormData();
        fd.set("body", text);
        if (asUpdate) fd.set("isUpdate", "1");
        await addDealNote(dealId, fd);
        toast.success(asUpdate ? "Posted. It's now the Latest update on this deal." : "Note added");
        setBody("");
        setMode("note");
        setOutstandingPrompt(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save that. Try again.");
      }
    });
  }

  async function handlePost() {
    if (!body.trim()) {
      toast.error("Write something first.");
      return;
    }
    if (!eod) return post(body, false);
    // An update that leaves out open client needs gets one gentle prompt first; when every need is in, it just posts.
    if (!hasOutstandingSection(body)) {
      try {
        const lines = await getOutstandingClientNeedLines(dealId);
        if (lines.length > 0) {
          setOutstandingPrompt(lines);
          return;
        }
      } catch {
        // Couldn't check: post as written rather than block the update.
      }
    }
    post(body, true);
  }

  function handlePullContext() {
    setPullingContext(true);
    const job = eod
      ? // Outstanding client needs go in their own section; appraisal, insurance, title and the key dates go under
        // Where we stand.
        Promise.all([getOutstandingClientNeedLines(dealId), getStandContextLines(dealId)]).then(([needLines, standLines]) =>
          setBody((current) => withStandContext(withOutstandingSection(current, needLines), standLines)),
        )
      : buildClientNeedsContextNote(dealId).then((text) => setBody(text));
    job
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't pull client need context."))
      .finally(() => setPullingContext(false));
  }

  return (
    <div className="space-y-4">
      <Card data-hi>
        <CardContent className="space-y-3 pt-6">
          {eod && <p className="text-sm font-semibold">End-of-day update</p>}
          <Textarea
            ref={bodyRef}
            rows={eod ? 10 : 5}
            placeholder={eod ? "Where we stand, and the issues we're working through…" : "Add a note..."}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={posting} onClick={handlePost}>
              {posting ? "Saving…" : eod ? "Post end-of-day update" : "Add note"}
            </Button>
            {!eod && (
              <Button type="button" variant="outline" onClick={startUpdate}>
                Start end-of-day update
              </Button>
            )}
            <Button type="button" variant="outline" disabled={pullingContext} onClick={handlePullContext}>
              {pullingContext ? "Pulling…" : "Pull Client Need Context"}
            </Button>
            {eod && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBody("");
                  setMode("note");
                }}
              >
                Discard draft
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {eod
              ? "“Pull Client Need Context” adds an Outstanding section from this deal's open client needs; edit it or add notes. If the deal has open needs and you post without them, you'll get a quick prompt. This becomes the Latest update under the deal header."
              : "Regular notes stay in the list below, even with the client needs pulled in. Only a note started with “Start end-of-day update” shows under the deal header."}
          </p>
        </CardContent>
      </Card>

      <Dialog open={outstandingPrompt !== null} onOpenChange={(open) => !open && setOutstandingPrompt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Include the outstanding client needs?</DialogTitle>
            <DialogDescription>
              This deal still has {outstandingPrompt?.length ?? 0} open client need{outstandingPrompt?.length === 1 ? "" : "s"}. Your update doesn&apos;t mention them yet.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {outstandingPrompt?.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOutstandingPrompt(null)}>
              Keep editing
            </Button>
            <Button type="button" variant="outline" disabled={posting} onClick={() => post(body, true)}>
              Post without them
            </Button>
            <Button type="button" disabled={posting} onClick={() => post(withOutstandingSection(body, outstandingPrompt ?? []), true)}>
              Include them and post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    {note.isUpdate && <Badge variant="default">End-of-day update</Badge>}
                    {note.id === latestUpdateId && <Badge variant="success">Shown under the header</Badge>}
                    <span>{note.createdAt.toLocaleString()}</span>
                    {note.editedAt && <span title={note.editedAt.toLocaleString()}>(edited)</span>}
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
                    {note.canEdit && editingId !== note.id && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(note.id)}>
                        Edit
                      </Button>
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
                {editingId === note.id ? (
                  <NoteEditor dealId={dealId} note={note} onDone={() => setEditingId(null)} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                )}
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
