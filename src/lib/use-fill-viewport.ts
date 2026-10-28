"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// The sticky top bar is 56px, plus a little air.
const TOP_GAP_PX = 68;
const BOTTOM_GAP_PX = 16;
const MIN_PX = 360;

/**
 * Desktop "fill the screen" sizing for a panel inside a Loan Center section: returns the height that
 * leaves the panel's bottom edge on the bottom of the window, and (once, after the page has grown to
 * that height) scrolls the section's tab bar up under the sticky top bar. Follows the window on resize.
 * Pass `ready: false` while the element isn't mounted yet (a loading placeholder).
 */
export function useFillViewport(ref: RefObject<HTMLElement | null>, enabled: boolean, ready: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  const scrolled = useRef(false);

  const tabAnchor = useCallback(() => {
    const el = ref.current;
    if (!el) return null;
    return el.closest('[role="tabpanel"]')?.parentElement?.querySelector('[role="tablist"]') ?? el;
  }, [ref]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const el = ref.current;
    const anchor = tabAnchor();
    if (!el || !anchor) return;
    const belowAnchor = el.getBoundingClientRect().top - anchor.getBoundingClientRect().top;
    setHeight(Math.max(MIN_PX, Math.floor(window.innerHeight - TOP_GAP_PX - belowAnchor - BOTTOM_GAP_PX)));
    const onResize = () => setHeight(Math.max(MIN_PX, Math.floor(window.innerHeight - el.getBoundingClientRect().top - BOTTOM_GAP_PX)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, ready, ref, tabAnchor]);

  useEffect(() => {
    if (!height || scrolled.current) return;
    scrolled.current = true;
    const anchor = tabAnchor();
    if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - TOP_GAP_PX, behavior: "instant" });
  }, [height, tabAnchor]);

  return height;
}
