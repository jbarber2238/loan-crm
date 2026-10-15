import Link from "next/link";
import { requirePartner } from "@/server/partner/session";
import { BankingForm, BankingUploadForm, W9Button } from "@/components/partner/payment-forms";

const MOSS = "#68735F";

function Chip({ label, done }: { label: string; done: boolean }) {
  return (
    <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: done ? "#143D4A" : "rgba(20,61,74,0.3)", color: done ? "#143D4A" : MOSS }}>
      {label}: {done ? "received ✓" : "needed"}
    </span>
  );
}

export default async function PartnerPaymentPage() {
  const partner = await requirePartner();
  const hasBanking = Boolean(partner.bankingReceivedAt);
  const hasW9 = Boolean(partner.w9ReceivedAt);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href="/partner" className="text-[11px] font-medium tracking-[0.2em] uppercase underline underline-offset-4" style={{ color: "#143D4A" }}>
          ← Back to your portal
        </Link>
        <h1 className="mt-4 text-3xl font-normal">Payment details</h1>
        <p className="mt-2 text-sm">
          Your payout goes out by ACH within 5 business days of our fee arriving from title — never before. We need two things on file: where to send it, and a W-9
          (referral income over $600 a year is reported on a 1099-NEC).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip label="ACH info" done={hasBanking} />
          <Chip label="W-9" done={hasW9} />
        </div>
      </div>

      <section className="space-y-4 rounded-sm border bg-white p-5">
        <h2 className="text-lg font-normal">1. How should we pay you?</h2>
        {hasBanking && (
          <p className="text-sm" style={{ color: MOSS }}>
            Your payment details are on file{partner.bankingLast4 ? ` (account ending in ${partner.bankingLast4})` : ""}. To change them, send new ones below.
          </p>
        )}
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium">Enter your account</h3>
            <BankingForm replacing={hasBanking} />
          </div>
          <div className="border-t pt-5">
            <h3 className="mb-2 text-sm font-medium">Or upload ACH instructions or a voided check</h3>
            <BankingUploadForm />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-sm border bg-white p-5">
        <h2 className="text-lg font-normal">2. W-9</h2>
        {hasW9 ? (
          <p className="text-sm" style={{ color: MOSS }}>
            Your W-9 is on file. Thank you.
          </p>
        ) : (
          <>
            <p className="text-sm">A short online form — it opens in a new tab and we get it the moment you finish.</p>
            <W9Button />
          </>
        )}
      </section>
    </div>
  );
}
