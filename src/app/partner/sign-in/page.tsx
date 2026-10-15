import { redirect } from "next/navigation";
import { getSessionPartner } from "@/server/partner/session";
import { PartnerSignInForm } from "@/components/partner/partner-sign-in-form";

export default async function PartnerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { expired } = await searchParams;
  if (await getSessionPartner()) redirect("/partner");
  return (
    <div className="mx-auto max-w-sm rounded-sm border bg-white p-6">
      <h1 className="text-2xl font-normal">Partner sign in</h1>
      <p className="mt-1 mb-6 text-sm" style={{ color: "#68735F" }}>
        See your referrals, where they stand, and what you&apos;ve earned.
      </p>
      {expired === "1" && (
        <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          That sign-in link has expired or was already used. Enter your password below, or email yourself a new link.
        </p>
      )}
      <PartnerSignInForm />
    </div>
  );
}
