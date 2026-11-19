"use client";

import { useState, useTransition } from "react";
import { Mic, Sparkles, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/tasks/time-picker";
import { SELECT_CLS, type TaskUser } from "@/components/tasks/task-parts";
import { useVoiceRecorder } from "@/components/messaging/use-voice-recorder";
import { draftTasksFromTranscript } from "@/server/ai/task-draft";
import { createTasks } from "@/server/actions/tasks";
import { isActionError } from "@/lib/action-result";
import { MAX_TASK_TITLE } from "@/lib/tasks";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/task-drafts";

interface DraftRow {
  key: number;
  title: string;
  dueDate: string;
  dueTime: string;
  who: string;
}

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Say (or type) what needs to get done on this deal, press Draft tasks, then review the drafts (change the wording,
 * date, time or who it's for) and add the ones you want. Nothing is saved until "Add tasks".
 */
export function TaskVoiceDrafter({ dealId, viewerId, users }: { dealId: string; viewerId: string; users: TaskUser[] }) {
  const voice = useVoiceRecorder();
  const [transcript, setTranscript] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [drafting, startDrafting] = useTransition();
  const [adding, startAdding] = useTransition();
  const [nextKey, setNextKey] = useState(1);

  async function toggleMic() {
    if (voice.recording) {
      const clip = await voice.stop();
      if (!clip) return;
      if (!clip.transcript) {
        toast.message("I didn't catch any words. You can type instead, or try again closer to the mic.");
        return;
      }
      setTranscript((t) => `${t.trim() ? `${t.trim()} ` : ""}${clip.transcript}`.slice(0, MAX_TRANSCRIPT_CHARS));
      return;
    }
    try {
      await voice.start();
    } catch (err) {
      const blocked = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      const missing = err instanceof DOMException && err.name === "NotFoundError";
      toast.error(
        blocked
          ? "The browser blocked the microphone. Click the icon at the left of the address bar, set Microphone to Allow, then try again. (Some embedded browsers can't use the mic at all; open the CRM in Chrome.)"
          : missing
            ? "No microphone was found on this device."
            : err instanceof Error
              ? err.message
              : "Couldn't start the microphone."
      );
    }
  }

  function draft() {
    startDrafting(async () => {
      const result = await draftTasksFromTranscript({ dealId, transcript });
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      setRows(
        result.drafts.map((d, i) => ({
          key: nextKey + i,
          title: d.title,
          dueDate: d.dueDate ?? "",
          dueTime: d.dueTime ?? "",
          who: d.assignedToUserId ?? viewerId,
        }))
      );
      setNextKey((k) => k + result.drafts.length);
    });
  }

  function update(key: number, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addAll() {
    const ready = rows.filter((r) => r.title.trim());
    if (ready.length === 0) {
      toast.error("Give at least one task a title.");
      return;
    }
    startAdding(async () => {
      const result = await createTasks(
        dealId,
        ready.map((r) => ({
          title: r.title,
          dueDate: r.dueDate || null,
          dueTime: r.dueDate ? r.dueTime || null : null,
          assignedToUserId: r.who,
        }))
      );
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      const others = ready.filter((r) => r.who !== viewerId).length;
      toast.success(
        `${result.added} task${result.added === 1 ? "" : "s"} added${others ? `. ${others} went to teammates' lists.` : ""}`
      );
      setRows([]);
      setTranscript("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Tap the mic and say what needs to get done on this deal. For example: “Call the appraiser tomorrow at 2, and have Sarah order the title by Friday.”"
            rows={3}
            maxLength={MAX_TRANSCRIPT_CHARS}
            disabled={voice.recording}
            className="min-h-20 flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant={voice.recording ? "destructive" : "outline"}
            onClick={toggleMic}
            aria-label={voice.recording ? "Stop recording" : "Start recording"}
            title={voice.recording ? "Stop recording" : "Record"}
          >
            {voice.recording ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={draft} disabled={drafting || voice.recording || !transcript.trim()}>
            <Sparkles className="size-4" />
            {drafting ? "Drafting…" : "Draft tasks"}
          </Button>
          {transcript && !voice.recording && (
            <Button type="button" variant="ghost" onClick={() => { setTranscript(""); setRows([]); }}>
              Clear
            </Button>
          )}
          {voice.recording && (
            <span className="flex items-center gap-2 text-sm text-destructive" aria-live="polite">
              <span className="size-2 animate-pulse rounded-full bg-destructive" />
              Listening… {mmss(voice.seconds)} · tap the square when you&apos;re done
            </span>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Draft tasks · review, then add</p>
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2">
              <Input
                value={r.title}
                onChange={(e) => update(r.key, { title: e.target.value })}
                maxLength={MAX_TASK_TITLE}
                aria-label="Task"
                className="min-w-[14rem] flex-1"
              />
              <Input
                type="date"
                aria-label="Due date (optional)"
                value={r.dueDate}
                onChange={(e) => update(r.key, { dueDate: e.target.value, ...(e.target.value ? {} : { dueTime: "" }) })}
                className="w-auto"
              />
              <TimePicker
                value={r.dueTime}
                disabled={!r.dueDate}
                onChange={(t) => update(r.key, { dueTime: t })}
                title={r.dueDate ? "Optional. A pop-up reminder appears at this time." : "Pick a date first"}
              />
              <select aria-label="Assigned to" value={r.who} onChange={(e) => update(r.key, { who: e.target.value })} className={SELECT_CLS}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === viewerId ? `Me (${u.name})` : `${u.name} · ${u.role}`}
                  </option>
                ))}
              </select>
              <Button type="button" size="icon" variant="ghost" aria-label="Remove this draft" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" onClick={addAll} disabled={adding}>
              {adding ? "Adding…" : `Add ${rows.length} task${rows.length === 1 ? "" : "s"}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRows([])}>
              Discard drafts
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
