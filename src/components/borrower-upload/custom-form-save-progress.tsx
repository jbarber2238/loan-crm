"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isActionError, type ActionError } from "@/lib/action-result";

type SaveResult = { savedAt: string } | ActionError;

// How often a changed form is saved on its own, and the quietest it will be: the borrower shouldn't have to
// remember to press anything before walking away.
const AUTOSAVE_MS = 20_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Snapshot of what's in the form right now, as sorted "name=value" pairs, to tell whether anything changed since
// the last save. (Radix selects write into hidden inputs inside the form, so FormData sees them too.)
function snapshot(form: HTMLFormElement): string {
  const pairs: string[] = [];
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string" && value.trim()) pairs.push(`${key}=${value.trim()}`);
  });
  return pairs.sort().join("\n");
}

export function CustomFormSaveProgress({
  saveAction,
  initialSavedAt,
}: {
  saveAction: (formData: FormData) => Promise<SaveResult>;
  initialSavedAt: string | null;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const lastSaved = useRef<string | null>(null);
  const saving = useRef(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [isSaving, setIsSaving] = useState(false);
  // The time is shown in the viewer's own timezone, which the server can't know, so it appears after mount.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // `quiet` is the automatic save: no spinner or toast unless it fails.
  async function save(quiet: boolean) {
    const form = anchorRef.current?.closest("form");
    if (!form || saving.current) return;
    const now = snapshot(form);
    if (quiet && now === lastSaved.current) return;
    saving.current = true;
    if (!quiet) setIsSaving(true);
    try {
      const result = await saveAction(new FormData(form));
      if (isActionError(result)) {
        if (!quiet) toast.error(result.error);
        return;
      }
      lastSaved.current = now;
      setSavedAt(result.savedAt);
      if (!quiet) toast.success("Progress saved — you can come back to this link any time.");
    } catch {
      if (!quiet) toast.error("Couldn't save just now — check your connection and try again.");
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  useEffect(() => {
    const form = anchorRef.current?.closest("form");
    // What's on screen when the page opens is already saved (or came from the loan file); only later edits count.
    if (form) lastSaved.current = snapshot(form);
    const timer = window.setInterval(() => void save(true), AUTOSAVE_MS);
    // Switching apps or closing the tab is the usual way someone walks away mid-form, so save then too.
    const onHide = () => {
      if (document.visibilityState === "hidden") void save(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span ref={anchorRef} className="text-xs text-muted-foreground" aria-live="polite">
        {savedAt && mounted ? `Progress saved at ${formatTime(savedAt)}` : savedAt ? "Progress saved" : "Long form? Save your progress and finish later."}
      </span>
      <Button type="button" variant="outline" disabled={isSaving} onClick={() => void save(false)}>
        {isSaving && <Loader2 className="size-4 animate-spin" />}
        Save progress
      </Button>
    </div>
  );
}
