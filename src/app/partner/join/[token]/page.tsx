import { getInvitePartner } from "@/server/actions/partner-portal";
import { PartnerProfileForm } from "@/components/partner/partner-profile-form";
import Link from "next/link";

export default async function PartnerJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const partner = await getInvitePartner(token);

  if (!partner) {
    return (
      <div className="mx-auto max-w-md rounded-sm border bg-white p-6 text-center">
        <h1 className="text-xl font-normal">This sign-up link has expired</h1>
        <p className="mt-2 text-sm" style={{ color: "#68735F" }}>
          Invite links work for 14 days. If you already set up your account,{" "}
          <Link href="/partner/sign-in" className="underline">
            sign in here
          </Link>
          ; otherwise ask us to send you a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-sm border bg-white p-6 md:p-8">
      <p className="text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: "#68735F" }}>
        Step 1 of 3 — Your profile
      </p>
      <h1 className="mt-2 text-2xl font-normal md:text-3xl">Welcome to the Manna Lending partner program</h1>
      <p className="mt-2 mb-6 text-sm">A couple of details and a password, then the terms. About two minutes.</p>
      <PartnerProfileForm token={token} name={partner.name} email={partner.email} />
    </div>
  );
}
