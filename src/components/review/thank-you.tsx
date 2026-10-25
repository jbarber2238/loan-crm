// What a client sees once they've answered: a thank-you, and, if they'd recommend us, the referral offer.
export function ThankYou({
  referralHref,
  first,
  pitch,
}: {
  /** Where "Set up my referral link" goes (the real page passes its own tokenized route). */
  referralHref: string;
  first: string;
  pitch: "offer" | "partner" | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Thank you, {first}!</h2>
        <p className="text-sm text-muted-foreground">
          We read every response. It genuinely helps us take better care of the next investor.
        </p>
      </div>

      {pitch === "offer" && (
        <div className="space-y-4 rounded-xl border-2 border-green-600/30 bg-green-600/5 p-5">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-green-700 uppercase dark:text-green-400">One more thing</p>
            <h3 className="text-lg font-semibold">Since you&apos;d recommend us, let us pay you for it</h3>
            <p className="text-sm">
              If you send someone our way and their loan closes, we&apos;d like to pay you a referral fee. It&apos;s our way of
              saying thank you.
            </p>
          </div>
          <ul className="space-y-1.5 text-sm">
            <li>✓ Takes about 1.5 to 2 minutes to set up</li>
            <li>✓ You get your own referral link to share</li>
            <li>✓ A private portal shows your referrals and an estimate of what you&apos;ll earn</li>
          </ul>
          <a
            href={referralHref}
            className="bp-primary inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground sm:w-auto"
          >
            Set up my referral link
          </a>
        </div>
      )}

      {pitch === "partner" && (
        <div className="space-y-3 rounded-xl border bg-muted/40 p-5">
          <p className="text-sm">
            Thanks for already being one of our referral partners. Your portal has everything you&apos;ve sent us.
          </p>
          <a
            href="/partner"
            className="bp-primary inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground sm:w-auto"
          >
            Open my partner portal
          </a>
        </div>
      )}
    </div>
  );
}
