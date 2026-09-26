"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateMySoundPrefs, type NotificationSoundPrefs } from "@/server/actions/notifications";
import { playSound, type SoundKind } from "@/lib/notification-sound";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const ROWS: { key: keyof NotificationSoundPrefs; sound: SoundKind; label: string; hint: string }[] = [
  { key: "soundChat", sound: "chat", label: "Team chat messages", hint: "A single soft pop" },
  { key: "soundTexts", sound: "text", label: "Client texts", hint: "Three quick falling notes" },
  { key: "soundNotifications", sound: "notification", label: "Other notifications (bell)", hint: "Two rising chime notes" },
];

export function NotificationSoundSettings({ initial }: { initial: NotificationSoundPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  function change(key: keyof NotificationSoundPrefs, sound: SoundKind, value: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    startTransition(async () => {
      try {
        await updateMySoundPrefs({ [key]: value });
        toast.success("Saved");
        if (value) playSound(sound);
      } catch {
        setPrefs(previous);
        toast.error("Couldn't save that");
      }
    });
  }

  return (
    <div className="space-y-3 border-t pt-4 max-w-md">
      <div>
        <p className="text-sm font-medium">Notification sounds</p>
        <p className="text-xs text-muted-foreground">
          A different chime for each kind of alert while the CRM is open. Your browser only allows sound after
          you&apos;ve clicked somewhere on the page.
        </p>
      </div>
      {ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={prefs[row.key]} onCheckedChange={(v) => change(row.key, row.sound, v === true)} />
            <span>
              {row.label}
              <span className="block text-xs text-muted-foreground">{row.hint}</span>
            </span>
          </label>
          <Button type="button" size="xs" variant="outline" onClick={() => playSound(row.sound)}>
            Play
          </Button>
        </div>
      ))}
    </div>
  );
}
