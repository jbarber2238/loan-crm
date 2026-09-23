import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { getConversionLinkData } from "@/server/actions/deal-conversion";
import { DscrRefiConversionForm } from "@/components/marketing/dscr-refi-conversion-form";
import { SiteHeader } from "@/components/marketing/site-header";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "DSCR Refinance Request — Manna Lending",
};

export default async function DscrRefiConversionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const { submitted } = await searchParams;

  const data = await getConversionLinkData(token);

  return (
    <>
      <SiteHeader />
      <DscrRefiConversionForm
        token={token}
        submitted={submitted === "1"}
        alreadyUsed={Boolean(data?.link.usedAt)}
        sourceDeal={data?.sourceDeal ?? null}
        fontVariable={archivo.variable}
      />
    </>
  );
}
