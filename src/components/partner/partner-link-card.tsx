"use client";

import { useState } from "react";
import Link from "next/link";

function CopyRow({ label, value, button }: { label: string; value: string; button: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <div
        className="flex min-w-0 flex-1 items-center gap-2 border px-3 py-2"
        style={{ borderColor: "rgba(250,247,242,0.35)", color: "#FAF7F2" }}
      >
        <span className="shrink-0 text-[9px] tracking-[0.18em] uppercase" style={{ color: "rgba(250,247,242,0.6)" }}>
          {label}
        </span>
        <span className="truncate font-mono text-xs">{value}</span>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            return;
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="w-20 shrink-0 border text-center text-[10px] leading-tight tracking-[0.16em] uppercase"
        style={
          button === "Copy link"
            ? { backgroundColor: "#CBB8A0", borderColor: "#CBB8A0", color: "#143D4A" }
            : { borderColor: "rgba(250,247,242,0.5)", color: "#FAF7F2" }
        }
      >
        {copied ? "Copied" : button}
      </button>
    </div>
  );
}

/** The partner's shareable link and embed code, with the button that opens the form to fill out with a borrower. */
export function PartnerLinkCard({ shortLink, embedSnippet }: { shortLink: string | null; embedSnippet: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-4 p-5" style={{ backgroundColor: "#143D4A" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] tracking-[0.18em] uppercase" style={{ color: "rgba(250,247,242,0.65)" }}>
          Your referral link
        </p>
        {shortLink && (
          <Link
            href={shortLink.replace(/^https?:\/\/[^/]+/, "")}
            className="border px-3 py-1.5 text-[10px] tracking-[0.18em] uppercase"
            style={{ borderColor: "rgba(250,247,242,0.5)", color: "#FAF7F2" }}
          >
            Submit a referral
          </Link>
        )}
      </div>
      <div className="space-y-2">
        {shortLink && <CopyRow label="Link" value={shortLink} button="Copy link" />}
        <CopyRow label="Embed" value={embedSnippet} button="Copy embed" />
      </div>
    </div>
  );
}
