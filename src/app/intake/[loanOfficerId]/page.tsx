import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { BrandedIntakeForm } from "@/components/marketing/branded-intake-form";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Loan Inquiry — Manna Lending",
};

export default async function PublicIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ loanOfficerId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { loanOfficerId } = await params;
  const { submitted } = await searchParams;

  const loanOfficer = await db.query.users.findFirst({
    where: eq(users.id, loanOfficerId),
  });

  return (
    <BrandedIntakeForm
      loanOfficer={loanOfficer}
      submitted={submitted === "1"}
      redirectBasePath="/intake"
      fontVariable={archivo.variable}
    />
  );
}
