"use client";

import { useEffect } from "react";

/** Tells the page this form is embedded in how tall the form currently is, so its frame can match. */
export function EmbedResizer() {
  useEffect(() => {
    if (window.parent === window) return;
    // Measure the form's own wrapper: the page itself is always at least as tall as the frame.
    const root = document.getElementById("manna-embed-root");
    if (!root) return;
    const send = () => window.parent.postMessage({ type: "manna-embed-height", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
    const observer = new ResizeObserver(send);
    observer.observe(root);
    send();
    return () => observer.disconnect();
  }, []);
  return null;
}
