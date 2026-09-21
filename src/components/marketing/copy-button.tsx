"use client";

import { useState } from "react";

/** A real click-to-copy button — only possible on an actual webpage, never inside an email (every mail client strips JavaScript), which is exactly why the affiliate's referral info lives here instead of pasted raw into the welcome email. */
export function CopyButton({
  text,
  label = "Copy",
  style,
}: {
  text: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can be unavailable (very old browser, insecure
      // context) — fail quietly rather than throwing in front of a
      // borrower-facing partner; they can still select and copy manually.
    }
  }

  return (
    <button type="button" onClick={handleCopy} className="shrink-0 rounded-sm px-3 py-2 text-xs font-medium tracking-wide hover:opacity-90" style={style}>
      {copied ? "Copied!" : label}
    </button>
  );
}
