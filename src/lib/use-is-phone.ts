"use client";

import { useSyncExternalStore } from "react";

function subscribePhone(callback: () => void) {
  const mq = window.matchMedia("(max-width: 1023px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
/** True below the laptop breakpoint. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false
  );
}
