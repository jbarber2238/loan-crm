"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getAttentionCount, savePushSubscription } from "@/server/actions/push-settings";

const POLL_MS = 20_000;
const TITLE_PREFIX = /^\(\d+\+?\)\s/;

/** Draws the site icon with a red count on it, like Gmail's tab. Resolves to a PNG data URL. */
function iconWithBadge(src: string, count: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, size, size);
      const label = count > 9 ? "9+" : String(count);
      const r = label.length > 1 ? 21 : 19;
      const cx = size - r + 1;
      const cy = r - 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e11d48";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${label.length > 1 ? 24 : 30}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 2);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("icon failed to load"));
    img.src = src;
  });
}

/**
 * Keeps three things in step with how many items are waiting on this person: a "(3)" in the browser tab's title, a
 * red number on the tab's icon, and the number on the app icon when the CRM is installed on a phone's home screen.
 * Renders nothing.
 */
export function AttentionSync() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const originals = useRef<Map<HTMLLinkElement, string>>(new Map());

  // Ask the server how many are waiting: when the page opens, when you move around, when you come back to the
  // tab, and every 20 seconds while it's open.
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      getAttentionCount()
        .then((n) => alive && setCount(n))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [pathname]);

  // The tab title.
  useEffect(() => {
    const apply = () => {
      const bare = document.title.replace(TITLE_PREFIX, "");
      const next = count > 0 ? `(${count > 99 ? "99+" : count}) ${bare}` : bare;
      if (document.title !== next) document.title = next;
    };
    apply();
    // The page sets its own title when you navigate; put the count back on it.
    const titleEl = document.querySelector("title");
    if (!titleEl) return;
    const observer = new MutationObserver(apply);
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [count, pathname]);

  // The tab's icon.
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    for (const l of links) if (!originals.current.has(l)) originals.current.set(l, l.href);
    if (links.length === 0) return;
    if (count <= 0) {
      for (const l of links) {
        const original = originals.current.get(l);
        if (original && l.href !== original) l.href = original;
      }
      return;
    }
    let cancelled = false;
    const base = originals.current.get(links[0]) ?? links[0].href;
    iconWithBadge(base, count)
      .then((url) => {
        if (cancelled) return;
        for (const l of links) {
          l.type = "image/png";
          l.href = url;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [count, pathname]);

  // The number on the installed app's icon (iPhone home screen, desktop installed app).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count > 0) nav.setAppBadge?.(count).catch(() => undefined);
    else nav.clearAppBadge?.().catch(() => undefined);
  }, [count]);

  // If this device already allowed push, keep the server's copy of it fresh (browsers occasionally replace it).
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        const json = sub?.toJSON();
        if (json?.endpoint && json.keys?.p256dh && json.keys?.auth) {
          return savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
        }
      })
      .catch(() => undefined);
  }, []);

  return null;
}
