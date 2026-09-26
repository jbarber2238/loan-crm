"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceClip {
  file: File;
  transcript: string;
  seconds: number;
}

// The browser's built-in speech recognition (Chrome, Edge, Safari) — free
// and needs no account or key, but the transcript quality is "good for a
// quick message", and unsupported browsers (e.g. Firefox) just get the audio
// with an empty transcript the sender can type into.
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function createRecognition(): RecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function pickMimeType(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Record a voice clip with a live transcript. `stop()` resolves with the finished clip. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<RecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const transcript = useRef("");
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const resolveStop = useRef<((clip: VoiceClip | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try {
      recognition.current?.stop();
    } catch {
      // already stopped
    }
    recognition.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Voice recording isn't supported in this browser");
    }
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    transcript.current = "";

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      const file = new File(chunks.current, `Voice clip.${ext}`, { type });
      const clip = { file, transcript: transcript.current.trim(), seconds: elapsed };
      cleanup();
      setRecording(false);
      resolveStop.current?.(clip);
      resolveStop.current = null;
    };
    recorder.current = rec;

    const sr = createRecognition();
    if (sr) {
      sr.continuous = true;
      sr.interimResults = false;
      sr.lang = navigator.language || "en-US";
      sr.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) transcript.current += `${e.results[i][0].transcript} `;
        }
      };
      // Chrome ends recognition on silence; restart while still recording.
      sr.onend = () => {
        if (recorder.current?.state === "recording") {
          try {
            sr.start();
          } catch {
            // ignore
          }
        }
      };
      try {
        sr.start();
        recognition.current = sr;
      } catch {
        recognition.current = null;
      }
    }

    startedAt.current = Date.now();
    setSeconds(0);
    timer.current = setInterval(() => setSeconds(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    rec.start();
    setRecording(true);
  }, [cleanup]);

  const stop = useCallback(
    () =>
      new Promise<VoiceClip | null>((resolve) => {
        if (!recorder.current || recorder.current.state === "inactive") return resolve(null);
        resolveStop.current = resolve;
        recorder.current.stop();
      }),
    []
  );

  const cancel = useCallback(() => {
    resolveStop.current = null;
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    cleanup();
    setRecording(false);
  }, [cleanup]);

  return { recording, seconds, start, stop, cancel };
}
