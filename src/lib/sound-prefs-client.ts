"use client";

import { getMySoundPrefs } from "@/server/actions/notifications";
import type { NotificationSoundPrefs } from "@/server/actions/notifications";

// The three pollers in the top bar each asked for the person's sound settings on every tick, which doubled their
// requests (and every server action waits in line behind the one before it). The settings almost never change, so
// ask once a minute and share the answer.
const TTL_MS = 60_000;
let cached: { at: number; value: Promise<NotificationSoundPrefs> } | null = null;

export function getSoundPrefsCached(): Promise<NotificationSoundPrefs> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const value = getMySoundPrefs().catch((err) => {
    // Don't keep a failure around for a minute.
    if (cached?.value === value) cached = null;
    throw err;
  });
  cached = { at: now, value };
  return value;
}
