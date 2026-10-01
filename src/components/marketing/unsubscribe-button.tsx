"use client";

import { useState, useTransition } from "react";
import { unsubscribeLeadFromMarketing } from "@/server/actions/leads";

const TEAL = "#143D4A";
const BASALT = "#1E1E1E";

export function UnsubscribeButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleClick() {
    startTransition(async () => {
      await unsubscribeLeadFromMarketing(leadId);
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-sm leading-relaxed" style={{ color: BASALT }}>
        You&apos;re unsubscribed from marketing emails from Manna Lending. This doesn&apos;t affect any calculator
        access you already have, or any direct call/email from us about a deal you&apos;re actively working with us
        on.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-sm px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ backgroundColor: TEAL }}
    >
      {pending ? "Unsubscribing…" : "Confirm Unsubscribe"}
    </button>
  );
}
