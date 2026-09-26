"use client";

// Three distinct sounds, made with the Web Audio API (no audio files):
//  - chat:         one soft "pop"          — internal team chat messages
//  - text:         three quick falling notes — a client text message
//  - notification: two rising chime notes   — everything else on the bell
// Browsers only allow sound after the person has interacted with the page,
// so before that this quietly does nothing rather than throwing.
export type SoundKind = "chat" | "text" | "notification";

const SOUNDS: Record<SoundKind, { freq: number; start: number; length: number; type: OscillatorType }[]> = {
  chat: [{ freq: 660, start: 0, length: 0.16, type: "sine" }],
  text: [
    { freq: 1318.5, start: 0, length: 0.14, type: "triangle" },
    { freq: 1046.5, start: 0.13, length: 0.14, type: "triangle" },
    { freq: 784, start: 0.26, length: 0.22, type: "triangle" },
  ],
  notification: [
    { freq: 880, start: 0, length: 0.28, type: "sine" },
    { freq: 1174.66, start: 0.12, length: 0.3, type: "sine" },
  ],
};

let ctx: AudioContext | null = null;

export function playSound(kind: SoundKind) {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    ctx ??= new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    if (ctx.state !== "running") return;

    const audio = ctx;
    const now = audio.currentTime;
    for (const { freq, start, length, type } of SOUNDS[kind]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + start);
      osc.stop(now + start + length + 0.02);
    }
  } catch {
    // Audio unavailable — silently skip.
  }
}
