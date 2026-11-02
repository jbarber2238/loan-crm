"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` every `ms` while the tab is on screen, skips ticks while it's hidden, and runs it once the moment
 * the tab comes back. Staff leave the CRM open in background tabs all day; polling there is pure load.
 * `ms` null turns it off. The callback is not run on mount — callers do their own first load.
 */
export function useVisibleInterval(callback: () => void, ms: number | null) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  });

  useEffect(() => {
    if (ms === null) return;
    const tick = () => {
      if (document.visibilityState !== "hidden") saved.current();
    };
    const timer = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
}
