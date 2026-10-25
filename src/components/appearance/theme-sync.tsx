"use client";

import { useEffect } from "react";

/**
 * Puts the user's theme on the <html> element while the staff app is on screen, so portaled
 * pieces (dialogs, menus, toasts) and the page background follow it too. The app layout also
 * wraps its own content in the same class for the first paint. Removed again on the way out so
 * public pages (borrower links, intake forms) are never dark.
 */
export function ThemeSync({ theme }: { theme: "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme === "dark" ? "dark" : "";
    return () => {
      root.classList.remove("dark");
      root.style.colorScheme = "";
    };
  }, [theme]);
  return null;
}
