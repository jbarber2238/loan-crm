"use client";

import { useRouter } from "next/navigation";

/** The dismissible "How you get paid" strip. Dismissal is remembered in a cookie; the header link brings it back. */
export function HowPaidBand({
  rate,
  minimum,
  exampleLoan,
  examplePayout,
}: {
  rate: number;
  minimum: number;
  exampleLoan: number;
  examplePayout: number;
}) {
  const router = useRouter();
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const Fig = ({ big, children }: { big: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3">
      <span className="text-xl tabular-nums whitespace-nowrap">{big}</span>
      <span className="max-w-[8.5rem] text-[10.5px] leading-snug" style={{ color: "rgba(250,247,242,0.85)" }}>
        {children}
      </span>
    </div>
  );

  return (
    <div
      id="how-paid"
      className="flex flex-wrap items-center gap-x-5 gap-y-4 px-5 py-4 xl:flex-nowrap"
      style={{ backgroundColor: "#68735F", color: "#FAF7F2" }}
    >
      <p className="w-20 shrink-0 text-[10px] tracking-[0.18em] uppercase">How you get paid</p>
      <Fig big={`${rate}%`}>of the broker fee on a first funded deal. {money(minimum)} minimum.</Fig>
      <Fig big="10%">on that borrower&apos;s repeat deals for 24 months.</Fig>
      <Fig big="5 days">ACH after our fee arrives. Paid only on funded deals.</Fig>
      <div className="hidden h-8 w-px lg:block" style={{ backgroundColor: "rgba(250,247,242,0.4)" }} />
      <Fig big={money(examplePayout)}>can come from a {money(exampleLoan)} loan. Example only; amounts vary by deal.</Fig>
      <button
        type="button"
        onClick={() => {
          document.cookie = "partner_how_dismissed=1; path=/partner; max-age=31536000; samesite=lax";
          router.replace("/partner");
          router.refresh();
        }}
        className="ml-auto shrink-0 border px-4 py-2 text-[10px] tracking-[0.18em] uppercase"
        style={{ borderColor: "rgba(250,247,242,0.6)" }}
      >
        Got it
      </button>
    </div>
  );
}
